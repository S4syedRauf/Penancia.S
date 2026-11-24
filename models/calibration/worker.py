import os
import sys
import json
import logging
from typing import Dict, Any, Optional, Tuple, Union
import numpy as np
import cv2
import scipy.ndimage
import scipy.signal

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "shared")))
from base_worker import BaseWorker

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# ============================================================================
# PROVISIONAL Acceptance Thresholds (CalibrationController.cs)
# Sourced from legacy CalibrationController; marked PROVISIONAL until Phase 10.
# ============================================================================
MIN_LINES_PROVISIONAL: int = 6
MAX_CV_PCT_PROVISIONAL: float = 5.0


def get_tool_version() -> str:
    git_sha = os.environ.get("GIT_SHA", "unknown")
    if git_sha == "unknown":
        try:
            import subprocess
            git_sha = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], stderr=subprocess.DEVNULL).decode().strip()
        except Exception:
            git_sha = "dev"
    return f"1.0.0-phase1+{git_sha} (numpy={np.__version__},scipy={scipy.__version__},opencv={cv2.__version__})"


def estimate_ruling_angle(gray: np.ndarray) -> float:
    """
    Estimates the dominant ruling line tilt relative to vertical (degrees).
    Uses Gaussian pre-filter, Canny edge detection, and Hough line transform.
    Returns angle in degrees to rotate the image so that lines become vertical.
    """
    h, w = gray.shape
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 40, 120, apertureSize=3)
    
    # Try high threshold first for clean dominant lines, fallback to lower
    lines = cv2.HoughLines(edges, 1, np.pi / 180, threshold=int(h * 0.35))
    if lines is None or len(lines) == 0:
        lines = cv2.HoughLines(edges, 1, np.pi / 180, threshold=max(20, int(h * 0.2)))

    if lines is None or len(lines) == 0:
        return 0.0

    angles = []
    for line in lines:
        _, theta = line[0]
        # Restrict to near vertical lines (+/- 35 degrees from vertical)
        if theta < np.pi / 5:
            angles.append(theta * 180.0 / np.pi)
        elif theta > 4 * np.pi / 5:
            angles.append((theta - np.pi) * 180.0 / np.pi)

    if not angles:
        return 0.0

    median_angle = float(np.median(angles))
    return median_angle


def rotate_image(gray: np.ndarray, angle_deg: float) -> np.ndarray:
    """
    Rotates a grayscale image around its center to align lines vertically.
    """
    if abs(angle_deg) < 0.1:
        return gray

    h, w = gray.shape
    center = (w / 2.0, h / 2.0)
    matrix = cv2.getRotationMatrix2D(center, angle_deg, 1.0)
    rotated = cv2.warpAffine(
        gray,
        matrix,
        (w, h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE
    )
    return rotated


def calibrate_ruling(
    image: Union[np.ndarray, str],
    reference_pitch_um: float,
    min_lines: int = MIN_LINES_PROVISIONAL,
    max_cv_pct: float = MAX_CV_PCT_PROVISIONAL
) -> Dict[str, Any]:
    """
    Executes the 7-step optical calibration algorithm specified in BLUEPRINT.md Step 1.3:
      1. Read image (any size), convert to grayscale, record dimensions.
      2. Estimate ruling angle via Hough line transform; rotate to make lines vertical.
      3. Take central 40% band of rows; average columns to 1-D profile; smooth.
      4. Find line centres with scipy.signal.find_peaks on inverted profile.
      5. pitch_px = median(diff(centres)); cv_pct = 100 * std(diff) / mean(diff).
      6. Reject if lines < min_lines or cv_pct > max_cv_pct (PROVISIONAL thresholds).
      7. µm/px = reference_pitch_um / pitch_px; return result dictionary.
    """
    if isinstance(image, str):
        img_mat = cv2.imread(image, cv2.IMREAD_UNCHANGED)
        if img_mat is None:
            raise FileNotFoundError(f"Cannot read image file at {image}")
    else:
        img_mat = image

    # 1. Grayscale and dimensions
    if img_mat.ndim == 3:
        gray = cv2.cvtColor(img_mat, cv2.COLOR_BGR2GRAY)
    elif img_mat.ndim == 2:
        gray = img_mat.copy()
    else:
        raise ValueError(f"Unsupported image dimensions: {img_mat.shape}")

    h, w = gray.shape
    image_width_px = int(w)
    image_height_px = int(h)

    # 2. Angle estimation and rotation
    angle_deg = estimate_ruling_angle(gray)
    rotated = rotate_image(gray, angle_deg)

    # 3. Central 40% band (rows 30% to 70%)
    row_start = int(0.30 * h)
    row_end = int(0.70 * h)
    if row_end <= row_start:
        row_start = 0
        row_end = h

    band = rotated[row_start:row_end, :]
    col_profile = np.mean(band, axis=0)

    # Smooth profile
    smoothed_profile = scipy.ndimage.gaussian_filter1d(col_profile, sigma=1.2)

    # 4. Invert profile for peak detection (optical dark lines on lighter background)
    # Check if lines are darker or lighter than background
    bg_is_light = np.median(smoothed_profile) > np.mean(smoothed_profile)
    if bg_is_light:
        inv_profile = np.max(smoothed_profile) - smoothed_profile
    else:
        inv_profile = smoothed_profile - np.min(smoothed_profile)

    span = np.max(inv_profile) - np.min(inv_profile)
    if span > 1e-6:
        norm_profile = (inv_profile - np.min(inv_profile)) / span
    else:
        norm_profile = np.zeros_like(inv_profile)

    # Find line centres with prominence and sub-pixel peak interpolation
    peaks, _ = scipy.signal.find_peaks(norm_profile, prominence=0.15, distance=3)
    line_centres = []
    for p in peaks:
        if 0 < p < len(norm_profile) - 1:
            y1, y2, y3 = norm_profile[p - 1], norm_profile[p], norm_profile[p + 1]
            denom = y1 - 2 * y2 + y3
            if abs(denom) > 1e-6:
                delta = 0.5 * (y1 - y3) / denom
                delta = max(-0.5, min(0.5, delta))
                line_centres.append(float(p + delta))
            else:
                line_centres.append(float(p))
        else:
            line_centres.append(float(p))
    lines_detected = len(line_centres)

    # 5. Spacing statistics
    if lines_detected >= 2:
        diffs = np.diff(line_centres)
        measured_pitch_px = float(np.median(diffs))
        mean_pitch = float(np.mean(diffs))
        std_pitch = float(np.std(diffs, ddof=1)) if len(diffs) > 1 else 0.0
        spacing_cv_pct = float(100.0 * std_pitch / mean_pitch) if mean_pitch > 0 else 0.0
    else:
        measured_pitch_px = None
        spacing_cv_pct = None

    # 6. Evaluation against provisional thresholds
    status = "Valid"
    reject_reason = None

    if lines_detected < min_lines:
        status = "Rejected"
        reject_reason = f"INSUFFICIENT_LINES: {lines_detected} lines detected (minimum {min_lines} required)."
    elif spacing_cv_pct is None or spacing_cv_pct > max_cv_pct:
        status = "Rejected"
        reject_reason = f"EXCESSIVE_SPACING_VARIANCE: CV {spacing_cv_pct:.2f}% exceeds provisional limit {max_cv_pct:.1f}%."

    # 7. Scale factor
    if status == "Valid" and measured_pitch_px and measured_pitch_px > 0:
        microns_per_pixel = float(reference_pitch_um / measured_pitch_px)
    else:
        microns_per_pixel = None

    return {
        "status": status,
        "reject_reason": reject_reason,
        "image_width_px": image_width_px,
        "image_height_px": image_height_px,
        "lines_detected": lines_detected,
        "line_centres_px": line_centres,
        "measured_pitch_px": round(measured_pitch_px, 4) if measured_pitch_px is not None else None,
        "spacing_cv_pct": round(spacing_cv_pct, 4) if spacing_cv_pct is not None else None,
        "reference_pitch_um": float(reference_pitch_um),
        "microns_per_pixel": round(microns_per_pixel, 6) if microns_per_pixel is not None else None,
        "rotation_applied_deg": round(angle_deg, 2),
        "tool_version": get_tool_version(),
        "thresholds_provisional": {
            "min_lines": min_lines,
            "max_cv_pct": max_cv_pct,
            "status": "PROVISIONAL_PENDING_PHASE_10"
        }
    }


class CalibrationWorker(BaseWorker):
    """
    Penancia.S Optical Calibration Worker:
    Processes calibration media assets, computes spatial scale factor (µm/px),
    and records line detection quality and spacing coefficient of variation.
    """
    def __init__(self):
        super().__init__("calibration")

    def process(self, inputs: Dict[str, str], params: Dict[str, Any]) -> Dict[str, Any]:
        image_uri = inputs.get("calibration_image_uri") or inputs.get("media_blob_uri")
        if not image_uri:
            raise ValueError("CALIBRATION_IMAGE_MISSING: calibration_image_uri or media_blob_uri is required.")

        pitch_val = params.get("reference_pitch_um")
        if pitch_val is None:
            raise ValueError("REFERENCE_PITCH_MISSING: reference_pitch_um parameter is required.")
        try:
            reference_pitch_um = float(pitch_val)
        except (ValueError, TypeError):
            raise ValueError(f"REFERENCE_PITCH_MISSING: invalid reference_pitch_um value: {pitch_val}")
        if reference_pitch_um <= 0:
            raise ValueError("REFERENCE_PITCH_MISSING: reference_pitch_um must be > 0.")

        # In production: download blob from Azure Storage or read local test file
        result = calibrate_ruling(image_uri, reference_pitch_um)
        return result


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Penancia.S Optical Calibration Worker (CLI only until Step 4.1)")
    parser.add_argument("image_path", nargs="?", help="Path to graticule ruling image")
    parser.add_argument("reference_pitch_um", nargs="?", type=float, help="Known physical pitch of ruling lines in microns")
    parser.add_argument("--out", dest="out_path", help="Path to write output result.json")

    args = parser.parse_args()
    if not args.image_path or args.reference_pitch_um is None:
        print("Usage: python worker.py <image_path> <reference_pitch_um> [--out <path>]")
        print("Note: CLI only until Step 4.1 Service Bus container job integration.")
        sys.exit(0)

    out = calibrate_ruling(args.image_path, args.reference_pitch_um)
    out_json = json.dumps(out, indent=2)
    print(out_json)

    if args.out_path:
        with open(args.out_path, "w", encoding="utf-8") as f:
            f.write(out_json)
