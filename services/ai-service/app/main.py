from pathlib import Path
from typing import Literal
import cv2
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from app.detector import VisionService


class Settings(BaseSettings):
    ai_port: int = 8000
    allowed_upload_root: str = "../../apps/backend/uploads"
    default_confidence_threshold: float = 0.35
    base_model_path: str = "yolov8n.pt"
    custom_equipment_model_path: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
vision_service = VisionService(
    base_model_path=settings.base_model_path,
    custom_equipment_model_path=settings.custom_equipment_model_path,
)

app = FastAPI(
    title="Training Centre Monitoring AI Service",
    version="0.2.0",
    description="Computer vision service for classroom occupancy estimation and equipment detection.",
)


class AnalyzeRequest(BaseModel):
    file_path: str
    media_type: Literal["IMAGE", "VIDEO"]
    task_type: Literal["OCCUPANCY", "EQUIPMENT_DETECTION", "COMBINED"] = "COMBINED"
    confidence_threshold: float = Field(default=0.35, ge=0.1, le=0.95)


def resolve_safe_media_path(raw_path: str) -> Path:
    allowed_root = Path(settings.allowed_upload_root).resolve()
    target = Path(raw_path).resolve()
    try:
        target.relative_to(allowed_root)
    except ValueError as exc:
        raise HTTPException(
            status_code=403,
            detail="Access denied: media file must reside inside controlled upload directory.",
        ) from exc

    if not target.is_file():
        raise HTTPException(status_code=404, detail="Media file not found on disk.")
    return target


@app.get("/")
def root():
    return {
        "message": "Training Centre Monitoring AI Service is running.",
        "health_endpoint": "/health",
        "docs_endpoint": "/docs",
    }


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "ai-service",
        "opencv_version": cv2.__version__,
        "confidence_threshold": settings.default_confidence_threshold,
        "base_model": settings.base_model_path,
        "supported_classes": vision_service.get_supported_classes(),
    }


@app.post("/analyze")
def analyze_media(payload: AnalyzeRequest):
    safe_path = resolve_safe_media_path(payload.file_path)
    try:
        if payload.media_type == "IMAGE":
            return vision_service.analyze_image(
                safe_path,
                task_type=payload.task_type,
                confidence_threshold=payload.confidence_threshold,
            )
        return vision_service.analyze_video(
            safe_path,
            task_type=payload.task_type,
            confidence_threshold=payload.confidence_threshold,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI inference failed: {exc}") from exc
