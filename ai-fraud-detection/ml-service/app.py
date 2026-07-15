"""
app.py — AI Fraud Detection Flask REST API
==========================================
Serves ML predictions via REST endpoints.
Auto-loads or trains the model on startup.
Supports CSV/Excel dataset upload with auto-retrain.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import pandas as pd
import joblib
import json
import os
import threading
from werkzeug.utils import secure_filename
from train_model import (train, engineer_features,
                         FEATURE_COLS, FEATURE_DESCRIPTIONS)

app = Flask(__name__)
CORS(app)

MODEL_PATH    = "fraud_model.pkl"
SCALER_PATH   = "scaler.pkl"
METRICS_PATH  = "model_metrics.json"
FEATURES_PATH = "feature_importance.json"
DATA_DIR      = "data"
DATA_PATH     = os.path.join(DATA_DIR, "creditcard.csv")

ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls"}

_model_bundle     = None
_scaler           = None
_retrain_lock     = threading.Lock()
_pending_feedback = []
_upload_status    = {"status": "idle", "message": "", "rows": 0, "fraud": 0}


# ── Model Lifecycle ────────────────────────────────────────────────────────────

def load_models():
    global _model_bundle, _scaler
    if os.path.exists(MODEL_PATH) and os.path.exists(SCALER_PATH):
        _model_bundle = joblib.load(MODEL_PATH)
        _scaler       = joblib.load(SCALER_PATH)
        print("[ML] Models loaded from disk.")
    else:
        print("[ML] No saved model — training now...")
        train()
        _model_bundle = joblib.load(MODEL_PATH)
        _scaler       = joblib.load(SCALER_PATH)


# ── Prediction Logic ───────────────────────────────────────────────────────────

def parse_transaction(data: dict) -> dict:
    return {
        "amount":        float(data.get("amount", 0)),
        "hour":          float(data.get("hour", 12)),
        "loginAttempts": float(data.get("loginAttempts", 1)),
        "accountAge":    float(data.get("accountAge", 12)),
        "isNewDevice":   float(data.get("isNewDevice", 0)),
        "isNight":       float(data.get("isNight", 0)),
    }


def predict_one(txn: dict) -> dict:
    row  = parse_transaction(txn)
    df   = pd.DataFrame([row])
    df   = engineer_features(df)
    X    = df[FEATURE_COLS].values
    X_sc = _scaler.transform(X)

    rf  = _model_bundle["rf"]
    iso = _model_bundle["iso"]

    prob          = float(rf.predict_proba(X_sc)[0][1])
    anomaly_score = float(iso.score_samples(X_sc)[0])
    is_anomaly    = bool(iso.predict(X_sc)[0] == -1)

    importances  = rf.feature_importances_
    feature_vals = np.abs(X_sc[0])
    raw_impacts  = importances * feature_vals
    total        = raw_impacts.sum() if raw_impacts.sum() > 0 else 1.0
    impacts      = raw_impacts / total

    top_indices = np.argsort(impacts)[::-1][:3]
    top_reasons = [
        {
            "feature":     FEATURE_COLS[i],
            "impact":      round(float(impacts[i]), 4),
            "description": FEATURE_DESCRIPTIONS.get(FEATURE_COLS[i], FEATURE_COLS[i])
        }
        for i in top_indices
    ]

    fraud_score = int(prob * 100)
    confidence  = "HIGH" if fraud_score >= 70 else "MEDIUM" if fraud_score >= 40 else "LOW"

    return {
        "fraudProbability": round(prob, 4),
        "fraudScore":       fraud_score,
        "isFraud":          prob >= 0.4,
        "confidence":       confidence,
        "explanation": {
            "topReasons":   top_reasons,
            "anomalyScore": round(anomaly_score, 4),
            "isAnomaly":    is_anomaly,
            "confidence":   confidence
        }
    }


# ── Dataset Upload Helpers ─────────────────────────────────────────────────────

def allowed_file(filename: str) -> bool:
    return os.path.splitext(filename)[1].lower() in ALLOWED_EXTENSIONS


def read_uploaded_file(filepath: str) -> pd.DataFrame:
    """Read CSV or Excel into DataFrame."""
    ext = os.path.splitext(filepath)[1].lower()
    if ext == ".csv":
        for enc in ["utf-8", "latin-1", "cp1252"]:
            try:
                return pd.read_csv(filepath, encoding=enc)
            except UnicodeDecodeError:
                continue
        return pd.read_csv(filepath, encoding="utf-8", errors="replace")
    elif ext in (".xlsx", ".xls"):
        return pd.read_excel(filepath)
    raise ValueError(f"Unsupported format: {ext}")


def validate_and_normalise(df: pd.DataFrame):
    """
    Accepts:
      1. Kaggle format  — columns: Amount, Class (+ V1..V28, Time)
      2. Custom format  — any column named amount/Amount + label/Class/isFraud/is_fraud/fraud
    Returns (normalised_df, info_message).
    """
    cols_lower = {c.lower(): c for c in df.columns}

    # ── Kaggle format ──────────────────────────────────────────────────────────
    if "class" in cols_lower and "amount" in cols_lower:
        df = df.rename(columns={
            cols_lower["amount"]: "amount",
            cols_lower["class"]:  "label"
        })
        fraud_n = int(df["label"].sum())
        return df, (f"✅ Kaggle format — {len(df):,} rows, "
                    f"{fraud_n:,} fraud cases ({fraud_n/len(df)*100:.2f}%)")

    # ── Custom format ──────────────────────────────────────────────────────────
    label_keys  = ["label", "isfraud", "is_fraud", "fraud", "fraudulent"]
    amount_keys = ["amount", "transactionamount", "txnamount", "value", "sum"]

    label_col  = next((cols_lower[k] for k in label_keys  if k in cols_lower), None)
    amount_col = next((cols_lower[k] for k in amount_keys if k in cols_lower), None)

    if label_col is None:
        raise ValueError(
            "Label column not found. Expected one of: Class, label, isFraud, is_fraud, fraud"
        )
    if amount_col is None:
        raise ValueError(
            "Amount column not found. Expected one of: Amount, amount, transactionAmount, value"
        )

    df = df.rename(columns={label_col: "label", amount_col: "amount"})
    df["label"]  = pd.to_numeric(df["label"],  errors="coerce").fillna(0).astype(int)
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)

    fraud_n = int(df["label"].sum())
    return df, (f"✅ Custom format — {len(df):,} rows, "
                f"{fraud_n:,} fraud cases ({fraud_n/len(df)*100:.2f}%)")


# ── REST Endpoints ─────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status":         "UP",
        "model_loaded":   _model_bundle is not None,
        "dataset_exists": os.path.exists(DATA_PATH),
        "service":        "AI Fraud Detection ML Service"
    })


@app.route("/predict", methods=["POST"])
def predict():
    if _model_bundle is None:
        return jsonify({"error": "Model not loaded"}), 503
    return jsonify(predict_one(request.get_json(force=True)))


@app.route("/predict/batch", methods=["POST"])
def predict_batch():
    if _model_bundle is None:
        return jsonify({"error": "Model not loaded"}), 503
    items = request.get_json(force=True)
    if not isinstance(items, list):
        return jsonify({"error": "Expected a JSON array"}), 400
    return jsonify([predict_one(t) for t in items])


@app.route("/model/stats", methods=["GET"])
def model_stats():
    if not os.path.exists(METRICS_PATH):
        return jsonify({"error": "No metrics — train the model first"}), 404
    with open(METRICS_PATH) as f:
        return jsonify(json.load(f))


@app.route("/model/features", methods=["GET"])
def model_features():
    if not os.path.exists(FEATURES_PATH):
        return jsonify({"error": "No feature data found"}), 404
    with open(FEATURES_PATH) as f:
        return jsonify(json.load(f))


@app.route("/retrain", methods=["POST"])
def retrain():
    global _model_bundle, _scaler, _pending_feedback

    data = request.get_json(force=True) or {}
    _pending_feedback.extend(data.get("transactions", []))

    if not _retrain_lock.acquire(blocking=False):
        return jsonify({"message": "Retraining already in progress"}), 202

    def do_retrain():
        global _model_bundle, _scaler, _pending_feedback
        try:
            metrics       = train()
            _model_bundle = joblib.load(MODEL_PATH)
            _scaler       = joblib.load(SCALER_PATH)
            _pending_feedback = []
            print("[ML] Retrain complete:", {k: v for k, v in metrics.items()
                                             if k != "confusion_matrix"})
        finally:
            _retrain_lock.release()

    threading.Thread(target=do_retrain, daemon=True).start()
    return jsonify({"message": "Retraining started in background"}), 202


# ── Dataset Upload ─────────────────────────────────────────────────────────────

@app.route("/upload/dataset", methods=["POST"])
def upload_dataset():
    """
    Upload a CSV or Excel dataset file.
    Accepts multipart/form-data with:
      - file         : dataset file (.csv / .xlsx / .xls)
      - auto_retrain : "true" (default) | "false"
    """
    global _upload_status

    if "file" not in request.files:
        return jsonify({"error": "No file part. Use multipart/form-data key: 'file'"}), 400

    f = request.files["file"]
    if not f or f.filename == "":
        return jsonify({"error": "No file selected"}), 400
    if not allowed_file(f.filename):
        ext = os.path.splitext(f.filename)[1]
        return jsonify({"error": f"'{ext}' not supported. Allowed: .csv, .xlsx, .xls"}), 400

    os.makedirs(DATA_DIR, exist_ok=True)
    temp_path = os.path.join(DATA_DIR, "upload_tmp" + os.path.splitext(secure_filename(f.filename))[1])
    f.save(temp_path)

    try:
        raw_df, info_msg = validate_and_normalise(read_uploaded_file(temp_path))

        if len(raw_df) < 100:
            os.remove(temp_path)
            return jsonify({"error": f"Dataset too small ({len(raw_df)} rows). Need ≥ 100."}), 400

        # Save as canonical dataset
        raw_df.to_csv(DATA_PATH, index=False)
        os.remove(temp_path)

        fraud_n = int(raw_df["label"].sum()) if "label" in raw_df.columns else 0
        total   = len(raw_df)

        _upload_status = {
            "status":   "uploaded",
            "message":  info_msg,
            "rows":     total,
            "fraud":    fraud_n,
            "filename": secure_filename(f.filename)
        }

        # Auto-retrain
        auto_retrain = request.form.get("auto_retrain", "true").lower() != "false"
        retrain_msg  = "Auto-retrain disabled."

        if auto_retrain:
            if _retrain_lock.acquire(blocking=False):
                def do_retrain_after_upload():
                    global _model_bundle, _scaler, _upload_status
                    _upload_status["status"] = "retraining"
                    try:
                        metrics       = train()
                        _model_bundle = joblib.load(MODEL_PATH)
                        _scaler       = joblib.load(SCALER_PATH)
                        _upload_status["status"]  = "done"
                        _upload_status["metrics"] = {
                            k: v for k, v in metrics.items() if k != "confusion_matrix"
                        }
                        print("[ML] Upload + retrain complete.")
                    except Exception as ex:
                        _upload_status["status"] = "error"
                        _upload_status["error"]  = str(ex)
                    finally:
                        _retrain_lock.release()

                threading.Thread(target=do_retrain_after_upload, daemon=True).start()
                retrain_msg = "Model retraining started in background."
            else:
                retrain_msg = "Retraining already running — skipped."

        return jsonify({
            "success":     True,
            "message":     info_msg,
            "filename":    secure_filename(f.filename),
            "rows":        total,
            "fraudCases":  fraud_n,
            "fraudRate":   f"{fraud_n/total*100:.2f}%" if total else "0%",
            "savedAs":     DATA_PATH,
            "retrain":     retrain_msg,
            "autoRetrain": auto_retrain
        }), 200

    except ValueError as ve:
        if os.path.exists(temp_path): os.remove(temp_path)
        return jsonify({"error": str(ve)}), 422
    except Exception as ex:
        if os.path.exists(temp_path): os.remove(temp_path)
        return jsonify({"error": f"Processing failed: {str(ex)}"}), 500


@app.route("/upload/status", methods=["GET"])
def upload_status_check():
    """Poll the status of the last upload + retrain."""
    return jsonify(_upload_status)


@app.route("/upload/dataset/info", methods=["GET"])
def dataset_info():
    """Metadata about the current on-disk dataset."""
    if not os.path.exists(DATA_PATH):
        return jsonify({"exists": False, "message": "No dataset on disk. Using synthetic data."})
    try:
        full_df   = pd.read_csv(DATA_PATH)
        label_col = "label" if "label" in full_df.columns else "Class"
        fraud_n   = int(full_df[label_col].sum()) if label_col in full_df.columns else 0
        total     = len(full_df)
        return jsonify({
            "exists":    True,
            "rows":      total,
            "columns":   list(full_df.columns[:10]),
            "fraud":     fraud_n,
            "safe":      total - fraud_n,
            "fraudRate": f"{fraud_n/total*100:.3f}%" if total else "0%",
            "filePath":  DATA_PATH
        })
    except Exception as ex:
        return jsonify({"exists": True, "error": str(ex)})


# ── Startup ────────────────────────────────────────────────────────────────────

with app.app_context():
    load_models()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
