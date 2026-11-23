import os
import sys
import numpy as np
import cv2
import pytest

sys.path.append(os.path.dirname(__file__))
from worker import calibrate_ruling, MIN_LINES_PROVISIONAL, MAX_CV_PCT_PROVISIONAL


def create_synthetic_ruling(
    width: int = 600,
    height: int = 400,
    pitch_px: float = 25.0,
    num_lines: int = 14,
    angle_deg: float = 0.0,
    noise_sigma: float = 0.0,
    line_positions: list = None
) -> np.ndarray:
    """
    Creates a synthetic optical graticule image (dark lines on bright background).
    """
    img = np.full((height, width), 235, dtype=np.uint8)

    if line_positions is None:
        start_x = int((width - (num_lines - 1) * pitch_px) / 2.0)
        line_positions = [start_x + i * pitch_px for i in range(num_lines)]

    for x in line_positions:
        x_int = int(round(x))
        if 2 <= x_int < width - 2:
            cv2.line(img, (x_int, 0), (x_int, height), 25, 2)

    if abs(angle_deg) > 0.01:
        center = (width / 2.0, height / 2.0)
        rot_mat = cv2.getRotationMatrix2D(center, angle_deg, 1.0)
        img = cv2.warpAffine(img, rot_mat, (width, height), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

    if noise_sigma > 0.0:
        np.random.seed(42)
        noise = np.random.normal(0, noise_sigma, img.shape)
        img = np.clip(img.astype(np.float32) + noise, 0, 255).astype(np.uint8)

    return img


def test_synthetic_ruling_exact_ratio_within_half_percent():
    """
    Asserts expected µm/px equals the exact known physical ratio within 0.5%.
    Synthetic ruling with known pitch of 25.0 px and known physical pitch 10.0 µm.
    Expected scale factor: 10.0 / 25.0 = 0.4000 µm/px.
    """
    known_pitch_px = 25.0
    reference_pitch_um = 10.0
    expected_um_per_px = reference_pitch_um / known_pitch_px  # 0.4000

    img = create_synthetic_ruling(pitch_px=known_pitch_px, num_lines=12, angle_deg=0.0)
    result = calibrate_ruling(img, reference_pitch_um=reference_pitch_um)

    assert result["status"] == "Valid"
    assert result["reject_reason"] is None
    assert result["lines_detected"] >= MIN_LINES_PROVISIONAL
    assert result["spacing_cv_pct"] <= MAX_CV_PCT_PROVISIONAL

    measured_um_per_px = result["microns_per_pixel"]
    error_pct = abs(measured_um_per_px - expected_um_per_px) / expected_um_per_px * 100.0

    assert error_pct <= 0.5, f"Error {error_pct:.3f}% exceeds allowable 0.5% tolerance (got {measured_um_per_px}, expected {expected_um_per_px})"


def test_synthetic_ruling_rotated_three_degrees():
    """
    Asserts rotation estimation and correction for a 3-degree tilted ruling.
    The resulting scale factor must remain within 0.5% of expected ratio.
    """
    known_pitch_px = 25.0
    reference_pitch_um = 10.0
    expected_um_per_px = reference_pitch_um / known_pitch_px

    img_rotated = create_synthetic_ruling(pitch_px=known_pitch_px, num_lines=12, angle_deg=3.0)
    result = calibrate_ruling(img_rotated, reference_pitch_um=reference_pitch_um)

    assert result["status"] == "Valid"
    assert result["lines_detected"] >= MIN_LINES_PROVISIONAL

    measured_um_per_px = result["microns_per_pixel"]
    error_pct = abs(measured_um_per_px - expected_um_per_px) / expected_um_per_px * 100.0

    assert error_pct <= 0.5, f"Error {error_pct:.3f}% under 3-degree rotation exceeds 0.5% tolerance"


def test_synthetic_ruling_with_noise():
    """
    Asserts robust peak detection and scale estimation under sensor noise (Gaussian sigma=15).
    Scale factor must remain within 0.5% of exact ratio.
    """
    known_pitch_px = 25.0
    reference_pitch_um = 10.0
    expected_um_per_px = reference_pitch_um / known_pitch_px

    img_noisy = create_synthetic_ruling(pitch_px=known_pitch_px, num_lines=12, noise_sigma=15.0)
    result = calibrate_ruling(img_noisy, reference_pitch_um=reference_pitch_um)

    assert result["status"] == "Valid"
    assert result["lines_detected"] >= MIN_LINES_PROVISIONAL

    measured_um_per_px = result["microns_per_pixel"]
    error_pct = abs(measured_um_per_px - expected_um_per_px) / expected_um_per_px * 100.0

    assert error_pct <= 0.5, f"Error {error_pct:.3f}% with noise exceeds 0.5% tolerance"


def test_synthetic_ruling_uneven_spacing_must_reject():
    """
    Asserts that unevenly spaced lines (CV% > 5%) are rejected.
    """
    reference_pitch_um = 10.0
    # Jittered line positions with high spacing variance
    uneven_positions = [100.0, 120.0, 155.0, 170.0, 210.0, 225.0, 270.0, 290.0]

    img_uneven = create_synthetic_ruling(line_positions=uneven_positions)
    result = calibrate_ruling(img_uneven, reference_pitch_um=reference_pitch_um)

    assert result["status"] == "Rejected"
    assert result["microns_per_pixel"] is None
    assert "EXCESSIVE_SPACING_VARIANCE" in result["reject_reason"]
    assert result["spacing_cv_pct"] > MAX_CV_PCT_PROVISIONAL


def test_synthetic_ruling_insufficient_lines_must_reject():
    """
    Asserts that fewer than 6 lines are rejected.
    """
    img_few_lines = create_synthetic_ruling(pitch_px=30.0, num_lines=4)
    result = calibrate_ruling(img_few_lines, reference_pitch_um=10.0)

    assert result["status"] == "Rejected"
    assert result["microns_per_pixel"] is None
    assert "INSUFFICIENT_LINES" in result["reject_reason"]
    assert result["lines_detected"] < MIN_LINES_PROVISIONAL


def test_thresholds_marked_provisional():
    """
    Asserts thresholds are explicitly marked PROVISIONAL in results.
    """
    img = create_synthetic_ruling(pitch_px=25.0, num_lines=10)
    result = calibrate_ruling(img, reference_pitch_um=10.0)

    assert result["thresholds_provisional"]["min_lines"] == 6
    assert result["thresholds_provisional"]["max_cv_pct"] == 5.0
    assert result["thresholds_provisional"]["status"] == "PROVISIONAL_PENDING_PHASE_10"
