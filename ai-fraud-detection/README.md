# 🛡️ AI-Powered Bank Transaction Fraud Detection System

A complete, production-ready fraud detection platform combining **Machine Learning**, **Spring Boot REST APIs**, and a **modern dark-mode frontend**.

---

## 🏗️ Architecture

```
Frontend (HTML/CSS/JS)  ──→  Spring Boot Backend (Port 9090)  ──→  Flask ML Service (Port 5000)
                                          │                                   │
                                    MongoDB Atlas                    fraud_model.pkl
                                   (fraud_detection)                  scaler.pkl
```

---

## 🤖 ML Model Details

| Property | Value |
|----------|-------|
| Algorithm | RandomForestClassifier + IsolationForest |
| Class Imbalance | SMOTE (sampling_strategy=0.1) |
| Features | amount, hour, loginAttempts, accountAge, isNewDevice, isNight, amount_log, amount_zscore |
| Fraud Score Formula | `(ML probability × 70) + (Rule score × 30)` |
| Fraud Threshold | Score ≥ 40 |
| Confidence | HIGH ≥70, MEDIUM 40-69, LOW < 40 |

---

## 📁 Project Structure

```
ai-fraud-detection/
├── fraud-detection-backend/          ← Spring Boot Java 21
│   ├── pom.xml
│   └── src/main/java/com/fraud/
│       ├── FraudDetectionApplication.java
│       ├── controller/               (AuthController, TransactionController, DashboardController, ModelController)
│       ├── service/                  (AuthService, MLService, FraudDetectionService, TransactionService)
│       ├── repository/               (TransactionRepository, UserRepository)
│       ├── model/                    (Transaction, User)
│       ├── dto/                      (6 DTOs)
│       ├── config/                   (SecurityConfig, JwtUtil, JwtFilter, CorsConfig, DataInitializer)
│       └── exception/                (GlobalExceptionHandler + 2 exceptions)
│
├── ml-service/                       ← Python Flask
│   ├── app.py                        (REST API)
│   ├── train_model.py                (Training pipeline)
│   ├── requirements.txt
│   └── data/
│       └── creditcard.csv            ← Place Kaggle dataset here
│
└── frontend/                         ← HTML/CSS/JS
    ├── login.html
    ├── register.html
    ├── dashboard.html
    ├── index.html
    ├── add-transaction.html
    ├── model-stats.html
    ├── css/  (style.css, dashboard.css, auth.css)
    └── js/   (api.js, auth.js, dashboard.js, transaction.js, model-stats.js)
```

---

## ⚡ Quick Start

### Step 1 — Python ML Service

```bash
cd ml-service
pip install -r requirements.txt
```

**Optional (better accuracy):** Download the Kaggle Credit Card Fraud dataset:
- URL: https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud
- Place `creditcard.csv` in `ml-service/data/`
- *(Without it, synthetic data is used automatically)*

```bash
# Train the model
python train_model.py

# Start the Flask API
python app.py
# Runs on http://localhost:5000
```

### Step 2 — Spring Boot Backend

```bash
cd fraud-detection-backend
mvn spring-boot:run
# Runs on http://localhost:9090
```

On first startup, default users are created automatically:
- **Admin**: `admin` / `admin123`
- **User**: `user` / `user123`

### Step 3 — Frontend

Open `frontend/login.html` in your browser.

---

## 🔌 REST API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login, returns JWT |

### Transactions
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/transactions` | ✅ | All transactions |
| POST | `/api/transactions` | ✅ | Create + analyse transaction |
| GET | `/api/transactions/{id}` | ✅ | Get by ID |
| DELETE | `/api/transactions/{id}` | 🔐 Admin | Delete transaction |
| GET | `/api/fraud` | ✅ | Fraudulent only |
| GET | `/api/safe` | ✅ | Safe only |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard` | Full dashboard data + charts |
| GET | `/api/statistics` | Summary stats |

### ML Model
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/model/stats` | Public | Model metrics |
| GET | `/api/model/features` | Public | Feature importance |
| POST | `/api/model/retrain` | 🔐 Admin | Trigger retraining |

### Flask ML Service
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service health check |
| POST | `/predict` | Single transaction prediction |
| POST | `/predict/batch` | Batch predictions |
| GET | `/model/stats` | Model metrics JSON |
| GET | `/model/features` | Feature importances JSON |
| POST | `/retrain` | Background model retraining |

---

## 📊 Frontend Pages

| Page | URL | Description |
|------|-----|-------------|
| Login | `login.html` | JWT login with User/Admin tabs |
| Register | `register.html` | Account creation with role selector |
| Dashboard | `dashboard.html` | KPIs, 3 charts, ML accuracy, auto-refresh |
| Transactions | `index.html` | Full table with search, filter, pagination, CSV export |
| Add Transaction | `add-transaction.html` | Form + real-time ML preview + XAI explanations |
| Model Stats | `model-stats.html` | Accuracy, F1, confusion matrix, feature chart |

---

## 🔒 Security

- **JWT Authentication** (jjwt 0.12.3)
- **BCrypt** password hashing
- **Role-Based Access**: `USER` / `ADMIN`
- **ADMIN only**: delete transactions, retrain model
- **CORS** configured for all origins (development)
- Spring Security stateless session

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| ML Service | Python 3.10+, Flask, scikit-learn, imbalanced-learn, joblib |
| Backend | Java 21, Spring Boot 3.2, Spring Security, Spring Data MongoDB |
| Database | MongoDB Atlas |
| Frontend | HTML5, CSS3, Vanilla JS, Chart.js 4.x |

---

## 📦 MongoDB Collections

- `transactions` — all submitted transactions with ML results
- `users` — registered users with hashed passwords

---

## ⚙️ Configuration

Edit `fraud-detection-backend/src/main/resources/application.properties`:

```properties
spring.data.mongodb.uri=mongodb+srv://...
ml.service.url=http://localhost:5000
jwt.secret=YourSecretKey
jwt.expiration=86400000
```

> ⚠️ Move credentials to environment variables before production deployment.

---

## 🧪 Testing the System

1. Login as `admin` / `admin123`
2. Go to **Add Transaction**
3. Enter: Amount=₹65000, Hour=2, Login Attempts=5, Account Age=1, New Device
4. Watch the real-time ML score update as you type
5. Submit → see fraud score + top 3 risk reasons
6. Go to **ML Model Stats** → view confusion matrix + feature importance

---

## 📈 Expected ML Performance (on Kaggle dataset)

| Metric | Value |
|--------|-------|
| Accuracy | ~99.5% |
| Precision | ~88% |
| Recall | ~82% |
| F1 Score | ~85% |
| AUC-ROC | ~97% |

*Note: Recall is the most important metric for fraud detection — minimising missed fraud cases.*
