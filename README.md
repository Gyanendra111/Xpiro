# Xpiro — Expiration Tracker

A full-stack application to track product expiration dates using OCR scanning and email alerts.

## Features

- **Expiry Tracking** — Add and monitor products with their expiration dates across multiple categories.
- **OCR Scanning** — Scan product labels using Tesseract.js to automatically detect expiry dates.
- **Email Reminders** — Receive automatic email alerts via SMTP when products are expiring soon or have already expired.
- **Category-aware Warnings** — Configurable warning windows per product category (e.g., dairy warns 1 day before, cosmetics 14 days before).

## Project Structure

```
Xpiro/
├── index.html           # Frontend single-page application
├── node_backend/        # Node.js / Express backend
│   ├── server.js        # Express server (OCR, email reminders, state API)
│   └── package.json     # Node.js dependencies
├── backend/             # Python / FastAPI backend
│   ├── app/             # FastAPI application (routes, models, schemas, utils)
│   ├── alembic/         # Database migrations
│   ├── requirements.txt # Python dependencies
│   └── Dockerfile       # Container configuration
└── .env.example         # Environment variable template
```

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later and npm
- [Python](https://www.python.org/) 3.10 or later and pip

## Environment Configuration

Both the Node.js backend and the Python backend require a `.env` file with your SMTP credentials.

1. Copy the template:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and fill in your details:
   ```dotenv
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   EMAIL_FROM=Xpiro Alerts <your-email@gmail.com>
   ```
   3. **Gmail App Password** — If you use Gmail, do **not** use your regular password. Instead, generate an App Password:
   1. Go to your [Google Account App Passwords](https://myaccount.google.com/apppasswords) (requires 2-Step Verification to be enabled).
   2. Create a new app password (e.g., name it "Xpiro").
   3. Paste the 16-character code into `SMTP_PASS` (remove any spaces).

For the Python backend, also copy and configure its own env file:
```bash
cp backend/.env.example backend/.env
```
Edit `backend/.env` and set a strong `SECRET_KEY` (e.g., `openssl rand -hex 32`).

## Installation

### Node.js backend

```bash
cd node_backend
npm install
```

### Python backend

```bash
pip install -r backend/requirements.txt
```

## Running the App

> **Which backend should I use?**
> - Use the **Node.js backend** if you want a simple, all-in-one setup with OCR and email reminders served from a single process.
> - Use the **Python / FastAPI backend** if you need user authentication, database migrations, and a production-ready API. In this case, open `index.html` directly in your browser or serve it with any static file server — do not run both backends at the same time on the same machine unless you change the ports.

### Node.js backend

Start the Express server from the `node_backend` directory:

```bash
cd node_backend
npm start
```

The server runs on <http://127.0.0.1:5000> by default and also serves the `index.html` frontend.

### Python / FastAPI backend

Start the FastAPI server from the `backend` directory:

```bash
cd backend
uvicorn app.main:app --reload
```

The API will be available at <http://127.0.0.1:8000> with interactive docs at <http://127.0.0.1:8000/docs>.

## Configuration Reference

| Variable | Description | Default |
|---|---|---|
| `SMTP_HOST` | SMTP server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_USER` | Email address used to send alerts | — |
| `SMTP_PASS` | SMTP password or App Password | — |
| `EMAIL_FROM` | Display name and address for outgoing emails | `SMTP_USER` |
| `PORT` | Port for the Node.js server | `5000` |
