import os
import time
import logging
from abc import ABC, abstractmethod
from typing import Dict, Any
from contract import JobRequest, JobResult

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

class BaseWorker(ABC):
    """
    Standard base worker class for all 10 Penancia.S model container jobs.
    Handles message decoding, timing, result serialization, and error trapping.
    """
    def __init__(self, service_name: str):
        self.service_name = service_name

    @abstractmethod
    def process(self, inputs: Dict[str, str], params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes model inference or processing.
        Returns:
            Dict containing output metrics, tracks, or classification tags.
        """
        pass

    def run(self, raw_message: str) -> JobResult:
        start_time = time.time()
        req = JobRequest.from_json(raw_message)

        logging.info(f"[{self.service_name}] Starting processing for job {req.job_id}")

        try:
            # Execute worker-specific logic
            output_data = self.process(req.inputs, req.params)
            elapsed = time.time() - start_time

            result_uri = f"results/{req.sample_id}/{self.service_name}.json"
            logging.info(f"[{self.service_name}] Completed in {elapsed:.2f}s -> {result_uri}")

            return JobResult(
                job_id=req.job_id,
                sample_id=req.sample_id,
                service=self.service_name,
                status="succeeded",
                result_uri=result_uri,
                execution_time_seconds=elapsed
            )

        except Exception as e:
            elapsed = time.time() - start_time
            logging.error(f"[{self.service_name}] Error during processing: {str(e)}", exc_info=True)
            return JobResult(
                job_id=req.job_id,
                sample_id=req.sample_id,
                service=self.service_name,
                status="failed",
                error_code=str(e),
                execution_time_seconds=elapsed
            )
