import os
import sys
import json
import tempfile
import numpy as np
import cv2
import pytest

sys.path.append(os.path.dirname(__file__))
from worker import calibrate_ruling, CalibrationWorker, MIN_LINES_PROVISIONAL, MAX_CV_PCT_PROVISIONAL
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "shared")))
from contract import JobRequest


def create_synthetic_ruling(
    width: int = 600,
    height: int = 400,
    pitch_px: float = 25.0,
    num_lines: int = 14,
    angle_deg: float = 0.0,
    noise_sigma: float = 0.0,
    line_positions: list = None,
    dark_lines: bool = True,
    vignette_pct: float = 0.0,
    blur_sigma: float = 0.0,
    subpixel_antialiasing: bool = True
) -> np.ndarray:
    """
    Creates a synthetic optical graticule image.
    Supports subpixel positioning, arbitrary rotation, polarity inversion, vignetting, and blur.
    """
    bg_val = 235 if dark_lines else 25
    line_val = 25 if dark_lines else 235
    img = np.full((height, width), bg_val, dtype=np.uint8)

    if line_positions is None:
        start_x = float(int((width - (num_lines - 1) * pitch_px) / 2.0))
        line_positions = [start_x + i * pitch_px for i in range(num_lines)]

    for x in line_positions:
        if subpixel_antialiasing:
            pt1 = (int(round(x * 16)), 0)
            pt2 = (int(round(x * 16)), height * 16)
            cv2.line(img, pt1, pt2, line_val, 2, lineType=cv2.LINE_AA, shift=4)
        else:
            x_int = int(round(x))
            if 2 <= x_int < width - 2:
                cv2.line(img, (x_int, 0), (x_int, height), line_val, 2)

    if abs(angle_deg) > 0.01:
        center = (width / 2.0, height / 2.0)
        rot_mat = cv2.getRotationMatrix2D(center, angle_deg, 1.0)
        img = cv2.warpAffine(img, rot_mat, (width, height), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

    if vignette_pct > 0.0:
        Y, X = np.ogrid[:height, :width]
        cy, cx = height / 2.0, width / 2.0
        max_r = np.sqrt(cy**2 + cx**2)
        r = np.sqrt((Y - cy)**2 + (X - cx)**2)
        vignette = 1.0 - (vignette_pct / 100.0) * (r / max_r)
        img = np.clip(img.astype(np.float32) * vignette, 0, 255).astype(np.uint8)

    if blur_sigma > 0.0:
        img = cv2.GaussianBlur(img, (0, 0), blur_sigma)

    if noise_sigma > 0.0:
        np.random.seed(42)
        noise = np.random.normal(0, noise_sigma, img.shape)
        img = np.clip(img.astype(np.float32) + noise, 0, 255).astype(np.uint8)

    return img


def test_job_request_contract_matches_fixture(monkeypatch):
    """
    B2: Asserts that JobRequest.from_json() correctly parses the shared fixture
    and that CalibrationWorker.process() receives the URI and pitch without defaults.
    """
    fixture_path = os.path.join(os.path.dirname(__file__), "fixtures", "job_calibration_request.json")
    with open(fixture_path, "r", encoding="utf-8") as f:
        raw_json = f.read()

    job_req = JobRequest.from_json(raw_json)
    assert job_req.job_id == "00000000-0000-0000-0000-000000000001"
    assert job_req.sample_id == "SMP-TEST-001"
    assert job_req.service == "calibration"
    assert job_req.inputs["calibration_image_uri"] == "raw-images/calibration_001.jpg"
    assert job_req.params["reference_pitch_um"] == 10.0

    worker = CalibrationWorker()
    captured_args = {}

    def mock_calibrate(img, ref_pitch, **kwargs):
        captured_args["img"] = img
        captured_args["ref_pitch"] = ref_pitch
        return {"status": "Valid", "microns_per_pixel": 0.4000}

    monkeypatch.setattr("worker.calibrate_ruling", mock_calibrate)
    res = worker.process(job_req.inputs, job_req.params)

    assert res["status"] == "Valid"
    assert captured_args["img"] == "raw-images/calibration_001.jpg"
    assert captured_args["ref_pitch"] == 10.0


def test_process_missing_reference_pitch_raises():
    """
    B1: Asserts that process() with no reference_pitch_um (or pitch <= 0)
    raises ValueError with REFERENCE_PITCH_MISSING instead of inventing 10 µm.
    """
    worker = CalibrationWorker()
    inputs = {"calibration_image_uri": "test_uri.jpg"}

    # Missing pitch
    with pytest.raises(ValueError, match="REFERENCE_PITCH_MISSING"):
        worker.process(inputs, {})

    # None pitch
    with pytest.raises(ValueError, match="REFERENCE_PITCH_MISSING"):
        worker.process(inputs, {"reference_pitch_um": None})

    # Zero or negative pitch
    with pytest.raises(ValueError, match="REFERENCE_PITCH_MISSING"):
        worker.process(inputs, {"reference_pitch_um": 0.0})

    with pytest.raises(ValueError, match="REFERENCE_PITCH_MISSING"):
        worker.process(inputs, {"reference_pitch_um": -10.0})


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

    assert error_pct <= 0.5, f"Error {error_pct:.3f}% exceeds allowable 0.5% tolerance"


@pytest.mark.parametrize("angle_deg", [3.0, 8.0])
def test_synthetic_ruling_rotations_three_and_eight_degrees(angle_deg):
    """
    B5: Asserts rotation estimation and correction for 3° and 8° tilted rulings.
    - rotation_applied_deg must be approximately -angle (within ±0.5°).
    - error must be <= 0.5%.
    (For 8°, uncorrected rotation has ~1% error and must fail the 0.5% threshold).
    """
    known_pitch_px = 25.0
    reference_pitch_um = 10.0
    expected_um_per_px = reference_pitch_um / known_pitch_px

    img_rotated = create_synthetic_ruling(pitch_px=known_pitch_px, num_lines=12, angle_deg=angle_deg)
    result = calibrate_ruling(img_rotated, reference_pitch_um=reference_pitch_um)

    assert result["status"] == "Valid"
    assert result["lines_detected"] >= MIN_LINES_PROVISIONAL

    # Assert rotation correction was measured and applied
    rot_applied = result["rotation_applied_deg"]
    assert abs(rot_applied - (-angle_deg)) <= 0.5, f"Applied rotation {rot_applied} differs from expected {-angle_deg}"

    measured_um_per_px = result["microns_per_pixel"]
    error_pct = abs(measured_um_per_px - expected_um_per_px) / expected_um_per_px * 100.0
    assert error_pct <= 0.5, f"Error {error_pct:.3f}% under {angle_deg}° rotation exceeds 0.5% tolerance"


def test_synthetic_ruling_non_integer_pitch_subpixel():
    """
    B5: Asserts accurate scale factor estimation for non-integer pitch (23.7 px) with anti-aliasing.
    Tolerance: error <= 0.2%. Kills the subpixel-removal mutation (which yields > 1.2% error).
    """
    known_pitch_px = 23.7
    reference_pitch_um = 10.0
    expected_um_per_px = reference_pitch_um / known_pitch_px

    img_subpixel = create_synthetic_ruling(
        pitch_px=known_pitch_px,
        num_lines=15,
        subpixel_antialiasing=True
    )
    result = calibrate_ruling(img_subpixel, reference_pitch_um=reference_pitch_um)

    assert result["status"] == "Valid"
    measured_um_per_px = result["microns_per_pixel"]
    error_pct = abs(measured_um_per_px - expected_um_per_px) / expected_um_per_px * 100.0
    assert error_pct <= 0.2, f"Error {error_pct:.3f}% on 23.7 px pitch exceeds 0.2% tolerance (kills subpixel mutation)"


def test_near_threshold_spacing_cv():
    """
    F4 / B5: Asserts near-threshold behaviour:
    - Real CV ~4.2% passes as Valid.
    - Real CV ~5.9% is rejected as EXCESSIVE_SPACING_VARIANCE.
    Loosening 5% limit to 6.5% will cause the 5.9% case to pass, failing this test.
    """
    pitch = 25.0
    start_x = 100.0
    ref_pitch_um = 10.0

    # 1. Near threshold ~4.2% CV (passes <= 5.0%):
    jitters_4 = [0.0, 0.55, -0.45, 0.65, -0.55, 0.45, -0.45, 0.55, -0.45, 0.55, -0.55, 0.45]
    positions_4 = [start_x + i * pitch + jitters_4[i] for i in range(len(jitters_4))]
    img_4 = create_synthetic_ruling(line_positions=positions_4, subpixel_antialiasing=True)
    res_4 = calibrate_ruling(img_4, ref_pitch_um)
    assert res_4["status"] == "Valid"
    assert 4.0 <= res_4["spacing_cv_pct"] <= 4.5

    # 2. Near threshold ~5.9% CV (rejected > 5.0%; would fail if limit loosened to 6.5%):
    jitters_59 = [0.0, 0.75, -0.65, 0.85, -0.75, 0.65, -0.65, 0.75, -0.65, 0.75, -0.75, 0.65]
    positions_59 = [start_x + i * pitch + jitters_59[i] for i in range(len(jitters_59))]
    img_59 = create_synthetic_ruling(line_positions=positions_59, subpixel_antialiasing=True)
    res_59 = calibrate_ruling(img_59, ref_pitch_um)
    assert res_59["status"] == "Rejected"
    assert "EXCESSIVE_SPACING_VARIANCE" in res_59["reject_reason"]
    assert 5.5 <= res_59["spacing_cv_pct"] <= 6.0


def test_synthetic_ruling_optical_blur():
    """
    F4: Asserts that a blurred grating (Gaussian blur sigma=1.2) remains Valid
    with scale factor within 0.5% of exact known physical ratio.
    """
    known_pitch_px = 25.0
    reference_pitch_um = 10.0
    expected_um_per_px = reference_pitch_um / known_pitch_px

    img_blurred = create_synthetic_ruling(pitch_px=known_pitch_px, num_lines=12, blur_sigma=1.2)
    result = calibrate_ruling(img_blurred, reference_pitch_um=reference_pitch_um)

    assert result["status"] == "Valid"
    assert result["lines_detected"] >= MIN_LINES_PROVISIONAL
    measured_um_per_px = result["microns_per_pixel"]
    error_pct = abs(measured_um_per_px - expected_um_per_px) / expected_um_per_px * 100.0
    assert error_pct <= 0.5, f"Blurred grating error {error_pct:.3f}% exceeds 0.5% tolerance"


def test_synthetic_ruling_lens_vignetting():
    """
    F4: Asserts that a vignetted grating (35% radial intensity falloff) remains Valid
    with scale factor within 0.5% of exact known physical ratio.
    """
    known_pitch_px = 25.0
    reference_pitch_um = 10.0
    expected_um_per_px = reference_pitch_um / known_pitch_px

    img_vignetted = create_synthetic_ruling(pitch_px=known_pitch_px, num_lines=12, vignette_pct=35.0)
    result = calibrate_ruling(img_vignetted, reference_pitch_um=reference_pitch_um)

    assert result["status"] == "Valid"
    assert result["lines_detected"] >= MIN_LINES_PROVISIONAL
    measured_um_per_px = result["microns_per_pixel"]
    error_pct = abs(measured_um_per_px - expected_um_per_px) / expected_um_per_px * 100.0
    assert error_pct <= 0.5, f"Vignetted grating error {error_pct:.3f}% exceeds 0.5% tolerance"


def test_bright_lines_dark_background_polarity():
    """
    B5: Asserts that bright lines on a dark background (inverted polarity)
    are correctly detected and yield scale factor within 0.5%, and that detected
    centres match true line coordinates (kills forced polarity mutation).
    """
    known_pitch_px = 25.0
    reference_pitch_um = 10.0
    expected_um_per_px = reference_pitch_um / known_pitch_px
    num_lines = 14

    img_bright = create_synthetic_ruling(
        pitch_px=known_pitch_px,
        num_lines=num_lines,
        dark_lines=False,
        subpixel_antialiasing=True
    )
    result = calibrate_ruling(img_bright, reference_pitch_um=reference_pitch_um)

    assert result["status"] == "Valid"
    measured_um_per_px = result["microns_per_pixel"]
    error_pct = abs(measured_um_per_px - expected_um_per_px) / expected_um_per_px * 100.0
    assert error_pct <= 0.5, f"Inverted polarity error {error_pct:.3f}% exceeds 0.5% tolerance"

    # Assert line centres match true drawn positions (not the inter-line background troughs)
    start_x = float(int((600 - (num_lines - 1) * known_pitch_px) / 2.0))
    true_positions = [start_x + i * known_pitch_px for i in range(num_lines)]
    assert abs(result["line_centres_px"][0] - true_positions[0]) < 0.5, \
        f"Detected centre {result['line_centres_px'][0]} deviated from true position {true_positions[0]}"


def test_recomputed_pitch_and_cv_parity():
    """
    B5: Recomputes pitch (np.median) and CV (ddof=1) from returned line_centres_px
    and asserts they equal reported values.
    Uses a jittered ruling with non-zero variance so mean != median and ddof=1 != ddof=0,
    strictly killing both mutations.
    """
    pitch = 25.0
    start_x = 100.0
    jitters = [0.0, 0.4, -0.3, 0.5, -0.4, 0.3, -0.3, 0.4, -0.3, 0.4, -0.4, 0.3]
    positions = [start_x + i * pitch + jitters[i] for i in range(len(jitters))]

    img = create_synthetic_ruling(line_positions=positions, subpixel_antialiasing=True)
    result = calibrate_ruling(img, reference_pitch_um=10.0)

    assert result["status"] == "Valid"
    centres = result["line_centres_px"]
    assert len(centres) >= 6

    diffs = np.diff(centres)
    expected_median_pitch = float(np.median(diffs))
    expected_cv_pct = float(100.0 * np.std(diffs, ddof=1) / np.mean(diffs))

    # Assert diff between median and mean is non-zero
    assert abs(expected_median_pitch - float(np.mean(diffs))) > 0.1
    # Assert diff between ddof=1 and ddof=0 is non-zero
    assert abs(expected_cv_pct - float(100.0 * np.std(diffs, ddof=0) / np.mean(diffs))) > 0.05

    assert result["measured_pitch_px"] == pytest.approx(expected_median_pitch, rel=1e-5)
    assert result["spacing_cv_pct"] == pytest.approx(expected_cv_pct, rel=1e-5)


def test_high_frequency_ripple_noise_kills_smoothing_mutation():
    """
    B5: Asserts that high-frequency column ripple noise is filtered out by Gaussian smoothing.
    Without smoothing (col_profile directly), 100+ spurious peaks are detected and the test fails.
    """
    h, w = 200, 500
    pitch = 25.0
    img = np.full((h, w), 235, dtype=np.uint8)
    for i in range(12):
        x = 100 + i * pitch
        cv2.line(img, (int(x), 0), (int(x), h), 40, 2)

    # High frequency alternating column ripple (+20 / -20)
    ripple = np.zeros((h, w), dtype=np.float32)
    ripple[:, ::2] = 20.0
    ripple[:, 1::2] = -20.0
    img_rippled = np.clip(img.astype(np.float32) + ripple, 0, 255).astype(np.uint8)

    result = calibrate_ruling(img_rippled, 10.0)
    assert result["status"] == "Valid"
    assert result["lines_detected"] == 12
    error_pct = abs(result["microns_per_pixel"] - 0.4) / 0.4 * 100.0
    assert error_pct <= 0.5


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


def test_thresholds_marked_provisional_and_tool_version():
    """
    Asserts thresholds are explicitly marked PROVISIONAL and tool_version is present.
    """
    img = create_synthetic_ruling(pitch_px=25.0, num_lines=10)
    result = calibrate_ruling(img, reference_pitch_um=10.0)

    assert result["thresholds_provisional"]["min_lines"] == 6
    assert result["thresholds_provisional"]["max_cv_pct"] == 5.0
    assert result["thresholds_provisional"]["status"] == "PROVISIONAL_PENDING_PHASE_10"
    assert "tool_version" in result
    assert "1.0.0-phase1" in result["tool_version"]


def test_cli_out_writes_result_json():
    """
    B3: Asserts that worker CLI supports --out <path> to write result.json.
    """
    img = create_synthetic_ruling(pitch_px=25.0, num_lines=10)
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as img_f:
        img_path = img_f.name
    cv2.imwrite(img_path, img)

    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as out_f:
        out_path = out_f.name

    try:
        import subprocess
        worker_script = os.path.join(os.path.dirname(__file__), "worker.py")
        cmd = [sys.executable, worker_script, img_path, "10.0", "--out", out_path]
        proc = subprocess.run(cmd, capture_output=True, text=True, check=True)

        assert os.path.exists(out_path)
        with open(out_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        assert data["status"] == "Valid"
        assert "microns_per_pixel" in data
        assert "tool_version" in data
    finally:
        if os.path.exists(img_path):
            os.remove(img_path)
        if os.path.exists(out_path):
            os.remove(out_path)
