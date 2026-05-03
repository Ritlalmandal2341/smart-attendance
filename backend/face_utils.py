import cv2
import numpy as np
import base64
import os

YUNET_MODEL_PATH = os.path.join(os.path.dirname(__file__), "yunet.onnx")
SFACE_MODEL_PATH = os.path.join(os.path.dirname(__file__), "sface.onnx")

detector = None
recognizer = None

def get_models():
    global detector, recognizer
    if detector is None or recognizer is None:
        if not os.path.exists(YUNET_MODEL_PATH) or not os.path.exists(SFACE_MODEL_PATH):
            raise Exception("Face models not downloaded yet.")
        detector = cv2.FaceDetectorYN.create(
            YUNET_MODEL_PATH, "", (320, 320), 0.9, 0.3, 5000
        )
        recognizer = cv2.FaceRecognizerSF.create(SFACE_MODEL_PATH, "")
    return detector, recognizer

def base64_to_cv2(image_base64: str):
    if "," in image_base64:
        image_base64 = image_base64.split(",")[1]
    try:
        nparr = np.frombuffer(base64.b64decode(image_base64), np.uint8)
        return cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    except Exception:
        return None

def extract_face_feature(image_base64: str) -> np.ndarray:
    """Detects the largest face and returns its 128-D encoding feature using CNN."""
    img = base64_to_cv2(image_base64)
    if img is None:
        raise ValueError("Invalid image provided")

    h, w, _ = img.shape
    det, rec = get_models()
    det.setInputSize((w, h))

    _, faces = det.detect(img)
    if faces is None or len(faces) == 0:
        return None

    face = faces[0]
    aligned_face = rec.alignCrop(img, face)
    feature = rec.feature(aligned_face)
    return feature.flatten()

def extract_all_face_features(image_base64: str) -> list:
    """Detect ALL faces in the image and return a list of {bbox, feature} dicts."""
    img = base64_to_cv2(image_base64)
    if img is None:
        raise ValueError("Invalid image provided")

    h, w, _ = img.shape
    det, rec = get_models()
    det.setInputSize((w, h))

    _, faces = det.detect(img)
    if faces is None or len(faces) == 0:
        return []

    results = []
    for face in faces:
        try:
            aligned_face = rec.alignCrop(img, face)
            is_live = check_liveness(aligned_face) # Check liveness of the aligned face crop
            feature = rec.feature(aligned_face).flatten()
            
            # landmarks: 5 points (right eye, left eye, nose, right mouth, left mouth)
            # face[4:14] contains x,y for 5 landmarks
            landmarks = face[4:14].tolist() 
            
            # bbox: x, y, w, h from the YuNet detection (first 4 values)
            bbox = [int(face[0]), int(face[1]), int(face[2]), int(face[3])]
            results.append({"bbox": bbox, "feature": feature, "is_live": is_live, "landmarks": landmarks})
        except Exception:
            # Skip faces that fail alignment/feature extraction
            continue

    return results

def check_liveness(image_cv2: np.ndarray) -> bool:
    """
    Performs basic liveness detection using Laplacian variance (sharpness check).
    Real faces have a specific range of sharpness. Photos/Screens are often blurred or have moire.
    """
    if image_cv2 is None:
        return False
    
    gray = cv2.cvtColor(image_cv2, cv2.COLOR_BGR2GRAY)
    variance = cv2.Laplacian(gray, cv2.CV_64F).var()
    
    # Threshold for sharpness. 
    # Real webcams usually have variance > 200-300 in good light. 
    # This is ultra-strict to block printed photos and most screens.
    if variance < 200:
        return False
        
    return True

def calculate_landmark_delta(landmarks1: list, landmarks2: list) -> float:
    """Calculate average pixel displacement of 5 landmarks between two frames."""
    if not landmarks1 or not landmarks2 or len(landmarks1) != 10 or len(landmarks2) != 10:
        return 0.0
    
    total_dist = 0.0
    for i in range(0, 10, 2):
        dx = landmarks1[i] - landmarks2[i]
        dy = landmarks1[i+1] - landmarks2[i+1]
        total_dist += np.sqrt(dx*dx + dy*dy)
    
    return total_dist / 5.0

COSINE_THRESHOLD = 0.45

def compare_faces(known_feature: np.ndarray, current_feature: np.ndarray) -> float:
    """Return cosine similarity score between two face features. Returns 0.0 on failure."""
    if known_feature is None or current_feature is None:
        return 0.0
    rec = get_models()[1]
    
    # Needs a 2D array [1, 128] for SFace
    kf = np.array([known_feature], dtype=np.float32)
    cf = np.array([current_feature], dtype=np.float32)
    
    score = rec.match(kf, cf, cv2.FaceRecognizerSF_FR_COSINE)
    return float(score)

def is_face_match(known_feature: np.ndarray, current_feature: np.ndarray) -> bool:
    """Simple boolean check using the cosine threshold."""
    return compare_faces(known_feature, current_feature) >= COSINE_THRESHOLD

def find_best_match(current_feature: np.ndarray, all_encodings, exclude_student_ids: set = None):
    """
    1-to-N match: find the best-matching encoding, excluding already-matched student IDs.
    Returns (best_record, best_score) or (None, 0.0).
    """
    if exclude_student_ids is None:
        exclude_student_ids = set()

    best_record = None
    best_score = 0.0

    for record in all_encodings:
        if record.student_id in exclude_student_ids:
            continue
        known_feature = np.frombuffer(record.encoding, dtype=np.float32)
        score = compare_faces(known_feature, current_feature)
        if score >= COSINE_THRESHOLD and score > best_score:
            best_score = score
            best_record = record

    return best_record, best_score

