"""
train_model.py — AI Fraud Detection Model Training Pipeline
============================================================
Trains RandomForestClassifier + IsolationForest on credit card fraud data.
Uses SMOTE for class imbalance, SHAP for explainability.
Falls back to synthetic data if creditcard.csv is not present.
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier, IsolationForest
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (accuracy_score, precision_score, recall_score,
                             f1_score, roc_auc_score, confusion_matrix)
from imblearn.over_sampling import SMOTE
import joblib
import json
import os
import warnings

warnings.filterwarnings("ignore")

# ── Paths ──────────────────────────────────────────────────────────────────────
DATA_PATH    = "data/creditcard.csv"
MODEL_PATH   = "fraud_model.pkl"
SCALER_PATH  = "scaler.pkl"
METRICS_PATH = "model_metrics.json"
FEATURES_PATH = "feature_importance.json"

# ── Feature columns used for training ─────────────────────────────────────────
FEATURE_COLS = [
    "amount", "hour", "loginAttempts", "accountAge",
    "isNewDevice", "isNight", "amount_log", "amount_zscore"
]

FEATURE_DESCRIPTIONS = {
    "amount":        "High Transaction Amount",
    "hour":          "Unusual Transaction Hour",
    "loginAttempts": "Multiple Login Attempts",
    "accountAge":    "New Account",
    "isNewDevice":   "New Device Used",
    "isNight":       "Night Transaction",
    "amount_log":    "Log-Scaled Amount",
    "amount_zscore": "Abnormal Amount Pattern"
}


# ── Feature Engineering ────────────────────────────────────────────────────────
def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """Compute derived features from raw transaction fields."""
    df = df.copy()

    # Log-transform of amount
    df["amount_log"] = np.log1p(df["amount"])

    # Z-score of amount
    mean_amt = df["amount"].mean()
    std_amt  = df["amount"].std() if df["amount"].std() != 0 else 1.0
    df["amount_zscore"] = (df["amount"] - mean_amt) / std_amt

    # Hour of day from Unix seconds (Kaggle Time column)
    if "hour" not in df.columns:
        if "Time" in df.columns:
            df["hour"] = (df["Time"] % 86400) / 3600
        else:
            df["hour"] = 12.0

    # Night flag (midnight–5 AM)
    if "isNight" not in df.columns:
        df["isNight"] = df["hour"].apply(lambda h: 1 if h < 6 else 0)

    # Behavioural features — default if absent
    if "loginAttempts" not in df.columns:
        df["loginAttempts"] = 1
    if "accountAge" not in df.columns:
        df["accountAge"] = 12
    if "isNewDevice" not in df.columns:
        df["isNewDevice"] = 0

    return df


# ── Kaggle Dataset Loader ──────────────────────────────────────────────────────
def load_kaggle_data():
    """Load the Kaggle credit card fraud CSV."""
    df = pd.read_csv(DATA_PATH)
    df.rename(columns={"Amount": "amount", "Class": "label"}, inplace=True)
    df = engineer_features(df)
    X = df[FEATURE_COLS]
    y = df["label"]
    print(f"  Kaggle dataset: {len(X):,} rows — {int(y.sum())} fraud cases ({y.mean()*100:.2f}%)")
    return X, y, df


# ── Synthetic Data Generator ───────────────────────────────────────────────────
def build_synthetic_data(n: int = 10_000):
    """Generate realistic synthetic transaction data when CSV is unavailable."""
    np.random.seed(42)
    n_fraud = int(n * 0.10)   # 10% fraud
    n_safe  = n - n_fraud

    safe = pd.DataFrame({
        "amount":        np.random.exponential(200,  n_safe),
        "hour":          np.random.uniform(8, 20,    n_safe),
        "loginAttempts": np.random.choice([1, 2],    n_safe, p=[0.9, 0.1]),
        "accountAge":    np.random.randint(6, 120,   n_safe),
        "isNewDevice":   np.random.choice([0, 1],    n_safe, p=[0.95, 0.05]),
        "isNight":       np.zeros(n_safe),
        "label":         np.zeros(n_safe)
    })

    fraud = pd.DataFrame({
        "amount":        np.random.exponential(5000, n_fraud),
        "hour":          np.random.choice(list(range(0, 5)) + list(range(22, 24)), n_fraud),
        "loginAttempts": np.random.randint(3, 10,   n_fraud),
        "accountAge":    np.random.randint(0, 6,    n_fraud),
        "isNewDevice":   np.ones(n_fraud),
        "isNight":       np.ones(n_fraud),
        "label":         np.ones(n_fraud)
    })

    df = pd.concat([safe, fraud], ignore_index=True).sample(frac=1, random_state=42)
    df = engineer_features(df)
    print(f"  Synthetic dataset: {len(df):,} rows — {int(df['label'].sum())} fraud cases")
    return df[FEATURE_COLS], df["label"]


# ── Main Training Function ─────────────────────────────────────────────────────
def train():
    print("\n" + "="*60)
    print("  AI FRAUD DETECTION — MODEL TRAINING")
    print("="*60)

    # 1. Load data
    print("\n[1/6] Loading data...")
    if os.path.exists(DATA_PATH):
        X, y, _ = load_kaggle_data()
    else:
        print("  creditcard.csv not found — using synthetic data")
        X, y = build_synthetic_data()

    # 2. Train/test split
    print("\n[2/6] Splitting data (80/20)...")
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"  Train: {len(X_train):,}  |  Test: {len(X_test):,}")

    # 3. Scale features
    print("\n[3/6] Scaling features...")
    scaler       = StandardScaler()
    X_train_sc   = scaler.fit_transform(X_train)
    X_test_sc    = scaler.transform(X_test)

    # 4. SMOTE oversampling
    print("\n[4/6] Applying SMOTE (sampling_strategy=0.5)...")
    smote = SMOTE(sampling_strategy=0.5, random_state=42)
    X_res, y_res = smote.fit_resample(X_train_sc, y_train)
    print(f"  After SMOTE — Fraud: {int(y_res.sum()):,}  Safe: {int((y_res == 0).sum()):,}")

    # 5. Train models
    print("\n[5/6] Training models...")
    print("  → Random Forest Classifier")
    rf = RandomForestClassifier(
        n_estimators=100,
        max_depth=10,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1
    )
    rf.fit(X_res, y_res)

    print("  → Isolation Forest (anomaly detection)")
    iso = IsolationForest(contamination=0.01, n_estimators=100, random_state=42)
    iso.fit(X_train_sc)

    # 6. Evaluate
    print("\n[6/6] Evaluating on test set...")
    y_pred = rf.predict(X_test_sc)
    y_prob = rf.predict_proba(X_test_sc)[:, 1]
    cm     = confusion_matrix(y_test, y_pred).tolist()

    metrics = {
        "accuracy":         round(float(accuracy_score(y_test, y_pred)), 4),
        "precision":        round(float(precision_score(y_test, y_pred, zero_division=0)), 4),
        "recall":           round(float(recall_score(y_test, y_pred, zero_division=0)), 4),
        "f1":               round(float(f1_score(y_test, y_pred, zero_division=0)), 4),
        "auc_roc":          round(float(roc_auc_score(y_test, y_prob)), 4),
        "confusion_matrix": cm,
        "train_samples":    int(len(X_train)),
        "test_samples":     int(len(X_test)),
        "fraud_cases":      int(y.sum()),
        "total_samples":    int(len(X)),
        "model_version":    "2.0",
        "algorithm":        "RandomForest + IsolationForest + SMOTE",
        "trained_at":       pd.Timestamp.now().isoformat()
    }

    print(f"\n  Accuracy : {metrics['accuracy']:.4f}")
    print(f"  Precision: {metrics['precision']:.4f}")
    print(f"  Recall   : {metrics['recall']:.4f}")
    print(f"  F1 Score : {metrics['f1']:.4f}")
    print(f"  AUC-ROC  : {metrics['auc_roc']:.4f}")

    # Feature importance
    importances = rf.feature_importances_
    feature_importance = [
        {
            "feature":     feat,
            "importance":  round(float(imp), 4),
            "description": FEATURE_DESCRIPTIONS.get(feat, feat)
        }
        for feat, imp in sorted(
            zip(FEATURE_COLS, importances), key=lambda x: x[1], reverse=True
        )
    ]

    # Save artefacts
    joblib.dump({"rf": rf, "iso": iso}, MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)

    with open(METRICS_PATH, "w") as f:
        json.dump(metrics, f, indent=2)
    with open(FEATURES_PATH, "w") as f:
        json.dump(feature_importance, f, indent=2)

    print(f"\n  ✔ Model  saved → {MODEL_PATH}")
    print(f"  ✔ Scaler saved → {SCALER_PATH}")
    print(f"  ✔ Metrics      → {METRICS_PATH}")
    print(f"  ✔ Features     → {FEATURES_PATH}")
    print("="*60 + "\n")

    return metrics


# ── Entry Point ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    train()
