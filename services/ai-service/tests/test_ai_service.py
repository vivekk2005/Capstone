import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np
from fastapi import HTTPException

from app.main import (
    AnalyzeRequest,
    analyze_media,
    health_check,
    resolve_safe_media_path,
    root,
    settings,
    vision_service,
)


class FakeBoxValue:
    def __init__(self, values):
        self._values = values

    def item(self):
        return self._values[0]

    def tolist(self):
        return self._values


class FakeBox:
    def __init__(self, cls_id: int, conf: float, xyxy):
        self.cls = [FakeBoxValue([cls_id])]
        self.conf = [FakeBoxValue([conf])]
        self.xyxy = [FakeBoxValue(xyxy)]


class FakeResult:
    def __init__(self, names, boxes):
        self.names = names
        self.boxes = boxes


class FakeYoloModel:
    def __init__(self, names, boxes):
        self.names = names
        self._boxes = boxes

    def predict(self, source, conf: float, verbose: bool = False):
        filtered = [box for box in self._boxes if box.conf[0].item() >= conf]
        return [FakeResult(self.names, filtered)]


class AiServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.upload_root = Path(self.temp_dir.name).resolve()
        self.orig_upload_root = settings.allowed_upload_root
        settings.allowed_upload_root = str(self.upload_root)

    def tearDown(self):
        settings.allowed_upload_root = self.orig_upload_root
        self.temp_dir.cleanup()

    def test_root_and_health_endpoints(self):
        root_payload = root()
        self.assertEqual(root_payload["health_endpoint"], "/health")

        health_payload = health_check()
        self.assertEqual(health_payload["status"], "ok")
        self.assertEqual(health_payload["service"], "ai-service")
        self.assertIn("PERSON", health_payload["supported_classes"])
        self.assertIn("COMPUTER", health_payload["supported_classes"])
        self.assertIn("MONITOR", health_payload["supported_classes"])

    def test_path_traversal_and_missing_files_are_blocked(self):
        outside_file = self.upload_root.parent / "outside_test_file.png"
        outside_file.write_bytes(b"not-allowed")
        try:
            with self.assertRaises(HTTPException) as ctx:
                resolve_safe_media_path(str(outside_file))
            self.assertEqual(ctx.exception.status_code, 403)
        finally:
            if outside_file.exists():
                outside_file.unlink()

        with self.assertRaises(HTTPException) as missing_ctx:
            resolve_safe_media_path(str(self.upload_root / "does-not-exist.png"))
        self.assertEqual(missing_ctx.exception.status_code, 404)

    def test_corrupt_image_returns_400(self):
        corrupt_path = self.upload_root / "corrupt.png"
        corrupt_path.write_bytes(b"definitely-not-a-valid-png")

        req = AnalyzeRequest(
            file_path=str(corrupt_path),
            media_type="IMAGE",
            task_type="COMBINED",
        )
        with self.assertRaises(HTTPException) as ctx:
            analyze_media(req)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_analyze_image_with_occupancy_and_equipment_filtering(self):
        image_path = self.upload_root / "classroom.png"
        blank = np.zeros((240, 320, 3), dtype=np.uint8)
        self.assertTrue(cv2.imwrite(str(image_path), blank))

        fake_model = FakeYoloModel(
            names={0: "person", 63: "laptop", 62: "tv"},
            boxes=[
                FakeBox(0, 0.91, [10.0, 20.0, 60.0, 120.0]),
                FakeBox(0, 0.82, [80.0, 20.0, 130.0, 120.0]),
                FakeBox(63, 0.77, [150.0, 80.0, 210.0, 140.0]),
                FakeBox(62, 0.25, [220.0, 50.0, 290.0, 110.0]),  # below 0.35 threshold
            ],
        )

        with patch.object(vision_service, "_get_base_model", return_value=fake_model), patch.object(
            vision_service, "_get_custom_model", return_value=None
        ):
            combined = analyze_media(
                AnalyzeRequest(
                    file_path=str(image_path),
                    media_type="IMAGE",
                    task_type="COMBINED",
                    confidence_threshold=0.35,
                )
            )
            self.assertEqual(combined["people_count"], 2)
            self.assertEqual(combined["equipment_counts"], {"COMPUTER": 1})
            self.assertEqual(len(combined["detections"]), 3)

            occupancy_only = analyze_media(
                AnalyzeRequest(
                    file_path=str(image_path),
                    media_type="IMAGE",
                    task_type="OCCUPANCY",
                    confidence_threshold=0.35,
                )
            )
            self.assertEqual(occupancy_only["people_count"], 2)
            self.assertEqual(occupancy_only["equipment_counts"], {})

    def test_analyze_video_samples_frames_and_computes_peak_occupancy(self):
        video_path = self.upload_root / "clip.avi"
        fourcc = cv2.VideoWriter_fourcc(*"MJPG")
        writer = cv2.VideoWriter(str(video_path), fourcc, 5.0, (160, 120))
        self.assertTrue(writer.isOpened())
        for _ in range(5):
            writer.write(np.zeros((120, 160, 3), dtype=np.uint8))
        writer.release()

        fake_model = FakeYoloModel(
            names={0: "person", 62: "tv"},
            boxes=[
                FakeBox(0, 0.88, [5.0, 5.0, 45.0, 95.0]),
                FakeBox(62, 0.65, [60.0, 10.0, 120.0, 70.0]),
            ],
        )

        with patch.object(vision_service, "_get_base_model", return_value=fake_model), patch.object(
            vision_service, "_get_custom_model", return_value=None
        ):
            data = analyze_media(
                AnalyzeRequest(
                    file_path=str(video_path),
                    media_type="VIDEO",
                    task_type="COMBINED",
                    confidence_threshold=0.35,
                )
            )
            self.assertEqual(data["media_type"], "VIDEO")
            self.assertGreaterEqual(data["frames_analyzed"], 1)
            self.assertEqual(data["peak_people_count"], 1)
            self.assertEqual(data["equipment_counts"], {"MONITOR": 1})


if __name__ == "__main__":
    unittest.main()
