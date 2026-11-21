import json
from dataclasses import dataclass, asdict
from typing import Optional, Dict, Any

@dataclass
class JobRequest:
    """
    Standardized payload delivered via Service Bus queue: sb-sahatnasemen/job-<service>
    Ensures deterministic, idempotent execution across all 10 computer vision models.
    """
    job_id: str             # Format: "{sample_id}:{service}:{attempt}"
    sample_id: str          # Unique clinical identifier
    service: str            # e.g. "pycasa", "banerjee", "madrnet", etc.
    schema_version: str     # e.g. "1.0.0"
    inputs: Dict[str, str]  # Blob URIs (e.g. {"media_blob_uri": "https://..."})
    params: Dict[str, Any]  # Optical parameters (microns_per_pixel, fps, chamber_depth_microns)

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, json_str: str) -> "JobRequest":
        data = json.loads(json_str)
        inputs = data.get("inputs") or {}
        if not inputs and "video_uri" in data:
            inputs = {"media_blob_uri": data.get("video_uri", "")}

        params = data.get("params") or {}
        if not params:
            params = {
                "microns_per_pixel": data.get("microns_per_pixel", 0.05),
                "fps": data.get("frames_per_second", 30.0),
                "frames_per_second": data.get("frames_per_second", 30.0),
                "chamber_depth_microns": data.get("chamber_depth", 10.0),
            }

        return cls(
            job_id=data.get("job_id", ""),
            sample_id=data.get("sample_id", ""),
            service=data.get("service", "video-qc"),
            schema_version=data.get("schema_version", "1.0.0"),
            inputs=inputs,
            params=params,
        )

@dataclass
class JobResult:
    """
    Standardized completion message published to: sb-sahatnasemen/model-results
    Raises Durable Functions event: model_done:{service}:{job_id}
    """
    job_id: str
    sample_id: str
    service: str
    status: str             # "succeeded" | "failed"
    result_uri: Optional[str] = None
    error_code: Optional[str] = None
    execution_time_seconds: float = 0.0

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, json_str: str) -> "JobResult":
        data = json.loads(json_str)
        return cls(**data)
