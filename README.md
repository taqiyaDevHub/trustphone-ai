# TrustPhone AI

**Check Before You Buy — Verify a second-hand phone before you spend your money.**

Built for the **Alibaba Cloud AI Hackathon Pakistan 2026**, delivered by Bano Qabil Pakistan, Cognix Solutions, and Alibaba Cloud.

## Problem

Pakistan's second-hand phone market has no easy way for buyers to check if a phone is stolen, blocked, or overpriced before handing over cash. TrustPhone AI gives buyers a quick, AI-assisted way to verify a device's status and flag risky transactions before they happen.

## Features

- **IMEI Verification** — Look up a device's status (Clean / Stolen / Blocked / Suspicious / Under Review) instantly.
- **Scan IMEI (OCR)** — Point a camera at a phone's IMEI sticker/box; EasyOCR + OpenCV extract the 15-digit number automatically.
- **AI Risk Scoring** — A trained ML model (scikit-learn) scores a transaction (0–100) based on asking price vs. market price and device history, with plain-language safety advice.
- **Report Stolen** — Owners can report a stolen device with evidence (photo of FIR/receipt), which is OCR-checked for consistency and marked `UNDER_REVIEW`.

## Tech Stack

**Frontend:** React + Vite + Tailwind CSS
**Backend:** FastAPI + SQLAlchemy + SQLite
**AI/ML:** scikit-learn (risk scoring), EasyOCR + OpenCV (IMEI extraction)

## Project Structure

```
trustphone-ai/
├── backend/                  # FastAPI app, ML model, & OCR services
│   ├── data/                 # Training data & ML model artifacts
│   ├── services/             # Core business logic & OCR services
│   ├── database.py           # Database connection & setup
│   ├── main.py               # FastAPI application entry point
│   ├── models.py             # Database models
│   ├── schemas.py            # Pydantic validation schemas
│   ├── train_model.py        # Model training script
│   └── requirements.txt      # Python dependencies
└── frontend/                 # React + Vite application
    ├── src/                  # React components & UI logic
    ├── index.html            # Entry HTML file
    ├── package.json          # Node dependencies
    ├── tailwind.config.js    # Tailwind CSS configuration
    └── vite.config.js        # Vite build setup
```

## API Endpoints

| Method | Endpoint               | Description                          |
|--------|------------------------|---------------------------------------|
| GET    | `/health`              | Health check                          |
| GET    | `/api/verify/{imei}`   | Look up a device by IMEI              |
| POST   | `/api/scan-imei`       | Extract IMEI from an uploaded image   |
| POST   | `/api/risk-score`      | AI risk assessment for a transaction  |
| POST   | `/api/report-stolen`   | Submit a stolen-device report         |

## Running Locally

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```
Backend runs at `http://localhost:8000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```
Frontend runs at `http://localhost:5173` (proxies `/api` and `/health` to the backend automatically).

## Environment Variables

**frontend/.env**
```
VITE_API_BASE_URL=   # leave empty for local dev (uses Vite proxy); set to deployed backend URL in production
```

## Disclaimer

The risk-scoring model is trained on **synthetic demo data** for hackathon purposes and does not reflect verified real-world fraud patterns. Risk scores are indicative signals, not definitive proof of a device's legitimacy.

## Team

## Team Members

* **Syeda Taqiya Noman** - Backend & Database Developer ([GitHub](https://github.com/taqiyaDevHub) | [LinkedIn](https://www.linkedin.com/in/syeda-taqiya-noman))
* **Jawerya Shafi** - Frontend Developer & UI Contributor

## Hackathon

Built for the **Alibaba Cloud AI Hackathon Pakistan 2026**.