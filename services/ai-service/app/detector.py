import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import cv2
from ultralytics import YOLO


BASE_CLASS_MAP = {
    "person": "PERSON",
    "laptop": "COMPUTER",
    "computer": "COMPUTER",
    "desktop": "COMPUTER",
    "pc": "COMPUTER",
    "tv": "MONITOR",
    "monitor": "MONITOR",
    "projector": "PROJECTOR",
    "fire_extinguisher": "FIRE_EXTINGUISHER",
    "fire extinguisher": "FIRE_EXTINGUISHER",
}


class VisionService:
    def __init__(self, base_model_path: str, custom_equipment_model_path: str = ""):
        self.base_model_path = base_model_path
        self.custom_equipment_model_path = custom_equipment_model_path
        self._base_model: Optional[YOLO] = None
        self._custom_model: Optional[YOLO] = None

    def _get_base_model(self) -> YOLO:
        if self._base_model is None:
            self._base_model = YOLO(self.base_model_path)
        return self._base_model

    def _get_custom_model(self) -> Optional[YOLO]:
        if self.custom_equipment_model_path and os.path.isfile(self.custom_equipment_model_path):
            if self._custom_model is None:
                self._custom_model = YOLO(self.custom_equipment_model_path)
            return self._custom_model
        return None

    def get_supported_classes(self) -> List[str]:
        supported = {"PERSON", "COMPUTER", "MONITOR"}
        custom = self._get_custom_model()
        if custom is not None:
            names = custom.names.values() if isinstance(custom.names, dict) else custom.names
            for raw in names:
                mapped = BASE_CLASS_MAP.get(str(raw).strip().lower())
                if mapped:
                    supported.add(mapped)
        return sorted(supported)

    def _run_model_on_frame(
        self,
        model: YOLO,
        frame: Any,
        conf: float,
        frame_index: int,
        task_type: str,
    ) -> List[Dict[str, Any]]:
        results = model.predict(source=frame, conf=conf, verbose=False)
        detections: List[Dict[str, Any]] = []
        if not results:
            return detections

        res = results[0]
        names = res.names
        for box in res.boxes:
            cls_id = int(box.cls[0].item())
            raw_label = str(names[cls_id]).strip().lower()
            mapped = BASE_CLASS_MAP.get(raw_label)
            if not mapped:
                continue

            if task_type == "OCCUPANCY" and mapped != "PERSON":
                continue
            if task_type == "EQUIPMENT_DETECTION" and mapped == "PERSON":
                continue

            x1, y1, x2, y2 = [round(float(v), 2) for v in box.xyxy[0].tolist()]
            score = round(float(box.conf[0].item()), 4)
            detections.append(
                {
                    "category": "PERSON_COUNT" if mapped == "PERSON" else "OBJECT_DETECTION",
                    "detected_class": mapped,
                    "raw_label": raw_label,
                    "confidence": score,
                    "bbox": [x1, y1, x2, y2],
                    "frame_index": frame_index,
                }
            )
        return detections

    def analyze_image(
        self,
        image_path: Path,
        task_type: str,
        confidence_threshold: float,
    ) -> Dict[str, Any]:
        start_time = time.perf_counter()
        frame = cv2.imread(str(image_path))
        if frame is None:
            raise ValueError("Unable to decode image file. Ensure it is a valid image.")

        height, width = frame.shape[:2]
        base_model = self._get_base_model()
        detections = self._run_model_on_frame(base_model, frame, confidence_threshold, 0, task_type)

        custom_model = self._get_custom_model()
        model_label = os.path.basename(self.base_model_path)
        if custom_model is not None and task_type in ("EQUIPMENT_DETECTION", "COMBINED"):
            custom_detections = self._run_model_on_frame(
                custom_model, frame, confidence_threshold, 0, "EQUIPMENT_DETECTION"
            )
            detections.extend(custom_detections)
            model_label = f"{model_label} + {os.path.basename(self.custom_equipment_model_path)}"

        people_count = sum(1 for d in detections if d["detected_class"] == "PERSON")
        equipment_counts: Dict[str, int] = {}
        for d in detections:
            if d["category"] == "OBJECT_DETECTION":
                cls_name = d["detected_class"]
                equipment_counts[cls_name] = equipment_counts.get(cls_name, 0) + 1

        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 1)

        return {
            "media_type": "IMAGE",
            "image_width": width,
            "image_height": height,
            "frames_analyzed": 1,
            "people_count": people_count,
            "peak_people_count": people_count,
            "equipment_counts": equipment_counts,
            "detections": detections,
            "supported_classes": self.get_supported_classes(),
            "model_name": "Ultralytics YOLOv8",
            "model_version": model_label,
            "confidence_threshold": confidence_threshold,
            "processing_ms": elapsed_ms,
        }

    def analyze_video(
        self,
        video_path: Path,
        task_type: str,
        confidence_threshold: float,
        max_sampled_frames: int = 10,
    ) -> Dict[str, Any]:
        start_time = time.perf_counter()
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise ValueError("Unable to open video file. Ensure it is a valid MP4/MOV/AVI/WEBM clip.")

        try:
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 0
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 0

            sample_indices: List[int]
            if total_frames <= 1:
                sample_indices = [0]
            elif total_frames <= max_sampled_frames:
                sample_indices = list(range(total_frames))
            else:
                step = max(1, total_frames // max_sampled_frames)
                sample_indices = list(range(0, total_frames, step))[:max_sampled_frames]

            base_model = self._get_base_model()
            custom_model = self._get_custom_model()

            frame_summaries: List[Tuple[int, int, List[Dict[str, Any]]]] = []
            for idx in sample_indices:
                cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
                ok, frame = cap.read()
                if not ok or frame is None:
                    continue

                frame_dets = self._run_model_on_frame(
                    base_model, frame, confidence_threshold, idx, task_type
                )
                if custom_model is not None and task_type in ("EQUIPMENT_DETECTION", "COMBINED"):
                    frame_dets.extend(
                        self._run_model_on_frame(
                            custom_model, frame, confidence_threshold, idx, "EQUIPMENT_DETECTION"
                        )
                    )

                ppl = sum(1 for d in frame_dets if d["detected_class"] == "PERSON")
                frame_summaries.append((idx, ppl, frame_dets))

            if not frame_summaries:
                raise ValueError("No readable video frames could be decoded from the uploaded clip.")

            people_counts = [item[1] for item in frame_summaries]
            avg_people = round(sum(people_counts) / len(people_counts))
            peak_idx, peak_people, peak_detections = max(frame_summaries, key=lambda x: x[1])

            equipment_counts: Dict[str, int] = {}
            for d in peak_detections:
                if d["category"] == "OBJECT_DETECTION":
                    cls_name = d["detected_class"]
                    equipment_counts[cls_name] = equipment_counts.get(cls_name, 0) + 1

            model_label = os.path.basename(self.base_model_path)
            if custom_model is not None:
                model_label = f"{model_label} + {os.path.basename(self.custom_equipment_model_path)}"

            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 1)

            return {
                "media_type": "VIDEO",
                "image_width": width,
                "image_height": height,
                "frames_analyzed": len(frame_summaries),
                "total_video_frames": total_frames,
                "peak_frame_index": peak_idx,
                "people_count": avg_people,
                "peak_people_count": peak_people,
                "equipment_counts": equipment_counts,
                "detections": peak_detections,
                "supported_classes": self.get_supported_classes(),
                "model_name": "Ultralytics YOLOv8 (Sampled Frames)",
                "model_version": model_label,
                "confidence_threshold": confidence_threshold,
                "processing_ms": elapsed_ms,
            }
        finally:
            cap.release()
