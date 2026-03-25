# Xpiro 🗓️

> **Never let anything expire again.** Xpiro is an inventory management app that tracks expiry dates for medicines, groceries, dairy products, and more — with built-in OCR scanning to auto-detect dates from product images.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Project Structure](#project-structure)
- [Setup & Running Locally](#setup--running-locally)
  - [Backend (Python / FastAPI)](#backend-python--fastapi)
  - [Frontend](#frontend)
- [API Documentation](#api-documentation)
- [Deployment (Docker)](#deployment-docker)
- [Contributing](#contributing)

---

## Overview

Xpiro helps individuals and small businesses keep track of product expiry dates. Users scan a product label with their camera (or upload an image), and the app uses OCR to extract text from the label, which is then parsed to identify the product name, brand, and expiry date automatically. Items nearing expiry trigger in-app and email reminders so nothing goes to waste or becomes a health hazard.

---

## Architecture

```
┌─────────────────────────────┐
│  Frontend (SPA)             │
│  index.html + vanilla JS    │
│  – Routing, UI, camera scan │
└────────────┬────────────────┘
             │ REST API (JSON)
             ▼
┌─────────────────────────────┐
│  Backend (Python / FastAPI) │
│  backend/app/               │
│  – Auth, CRUD, OCR, email   │
└────────────┬────────────────┘
             │ SQLAlchemy ORM
             ▼
┌─────────────────────────────┐
│  Database                   │
│  SQLite (dev) or PostgreSQL │
└─────────────────────────────┘
```

| Layer     | Technology                       |
|-----------|----------------------------------|
| Frontend  | HTML5, CSS3, Vanilla JavaScript  |
| Backend   | Python 3.10+, FastAPI, Uvicorn   |
| ORM       | SQLAlchemy 2 + Alembic           |
| Auth      | JWT (python-jose + passlib)      |
| OCR       | Tesseract + pytesseract + Pillow |
| Email     | SMTP via Python `smtplib`        |
| Scheduler | APScheduler (background jobs)    |
| Database  | SQLite (default) / PostgreSQL    |

---

## Features

| Feature | Description |
|---------|-------------|
| **Authentication** | Register, login, JWT-protected routes, per-user data isolation |
| **Inventory CRUD** | Add, edit, delete, and list tracked items with category, brand, and expiry date |
| **OCR Scanning** | Upload or capture a product image; backend returns raw OCR text, which the frontend parses to auto-fill product name, brand, and expiry date |
| **Expiry Reminders** | Configurable per-item reminders (in-app and/or email); background job runs every 15 minutes |
| **Activity History** | Full audit log of adds, edits, deletes, and reminder events |
| **Admin Panel** | Manage all users and items; view system-wide statistics |
| **Contact Form** | Users can submit messages; forwarded to a configured support email address |
| **Dark / Light Theme** | Fully client-side theme engine driven by CSS variables |
| **Dashboard Stats** | Summary of expired, expiring soon, and good items |

---
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
├── index.html              # Frontend SPA (single-page application)
├── server.js               # Legacy Node.js/Express backend (reference only)
├── package.json
├── .env.example            # SMTP env vars for Node backend
├── backend/                # Python/FastAPI backend
│   ├── app/
│   │   ├── main.py         # FastAPI app entry point
│   │   ├── config.py       # Settings (pydantic-settings)
│   │   ├── database.py     # SQLAlchemy engine & session
│   │   ├── models/         # ORM models (User, Item, History, …)
│   │   └── routes/         # API routers
│   │       ├── auth.py     # /api/auth/*
│   │       ├── items.py    # /api/items/*
│   │       ├── history.py  # /api/history/*
│   │       ├── state.py    # /api/state  (legacy bulk sync)
│   │       ├── scan.py     # /scan       (OCR endpoint)
│   │       ├── reminders.py# /api/reminders/*
│   │       ├── admin.py    # /api/admin/*
│   │       └── contact.py  # /api/contact
│   ├── alembic/            # Database migrations
│   ├── alembic.ini
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env.example        # All configurable environment variables
│   ├── uploads/            # Uploaded images (OCR processing)
│   └── tests/
│       └── test_api.py
└── README.md               # This file
```

---

## Setup & Running Locally

### Prerequisites

- Python 3.10+
- [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) installed on the system
  - macOS: `brew install tesseract`
  - Ubuntu/Debian: `sudo apt-get install tesseract-ocr`
  - Windows: [download the installer](https://github.com/UB-Mannheim/tesseract/wiki)
- (Optional) Node.js 18+ if you want to serve the frontend with the legacy Express server

---

### Backend (Python / FastAPI)

```bash
# 1. Navigate to the backend directory
cd backend

# 2. Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment variables
cp .env.example .env
# Edit .env and fill in SECRET_KEY, SMTP credentials, etc.

# 5. Run database migrations
alembic upgrade head

# 6. Start the development server
uvicorn app.main:app --reload --port 8000
```

The API will be available at **http://localhost:8000**.

#### Key environment variables (`backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///./xpiro.db` | SQLAlchemy connection string |
| `SECRET_KEY` | *(required)* | Random secret used to sign JWT tokens |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | Token lifetime (24 h) |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server for outgoing email |
| `SMTP_PORT` | `587` | SMTP port (STARTTLS) |
| `SMTP_USER` | — | SMTP username / email address |
| `SMTP_PASS` | — | SMTP password or app password |
| `EMAIL_FROM` | — | Display name + address for reminder emails |
| `CONTACT_EMAIL` | *(falls back to `SMTP_USER`)* | Recipient for contact form submissions |
| `ALLOWED_ORIGINS` | `http://localhost:5000,http://127.0.0.1:5000` | Comma-separated CORS origins |

---

### Frontend

The frontend is a single `index.html` file — no build step required.

> ⚠️ Do **not** open `index.html` directly via `file://` (for example using `open index.html` or `xdg-open index.html`).  
> The app uses relative API calls like `fetch('/api/...')` and `fetch('/scan')`, which require being served from an HTTP(S) origin with a running backend on the same host.
>
> Instead, serve the frontend over HTTP using one of the options below.

**Option B – Serve with the legacy Node.js backend** (also serves `index.html`)

```bash
cp .env.example .env     # Configure SMTP settings
npm install
npm start                # Starts Express server on http://localhost:5000
```

**Option C – Any static file server**

```bash
npx serve .              # Serves on http://localhost:3000 (or similar)
```

> **Note:** The frontend uses relative paths for API calls. By default, the FastAPI backend runs at `http://localhost:8000`. In development, either open `index.html` directly while the backend is running on `http://localhost:8000`, or serve the frontend and backend from the same origin (for example, via a reverse proxy or dev server) so that relative API requests reach the FastAPI app.

---

## API Documentation

FastAPI generates interactive documentation automatically:

| UI | URL (local) |
|----|-------------|
| **Swagger UI** | http://localhost:8000/docs |
| **ReDoc** | http://localhost:8000/redoc |

### Endpoint Summary

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/register` | — | Create a new account |
| `POST` | `/api/auth/login` | — | Obtain a JWT access token |
| `GET` | `/api/auth/me` | ✅ | Get current user profile |
| `PUT` | `/api/auth/me` | ✅ | Update profile / settings |
| `GET` | `/api/items` | ✅ | List all items (with filters) |
| `POST` | `/api/items` | ✅ | Add a new item |
| `PUT` | `/api/items/{id}` | ✅ | Update an item |
| `DELETE` | `/api/items/{id}` | ✅ | Delete an item |
| `POST` | `/scan` | — | OCR scan (base64 image → { text: string }) |
| `GET` | `/api/reminders` | ✅ | List upcoming reminders |
| `POST` | `/api/reminders/check` | ✅ | Trigger reminder check & email delivery |
| `GET` | `/api/history` | ✅ | Get activity log |
| `GET` | `/api/state` | ✅ | Bulk-fetch state (legacy sync) |
| `PUT` | `/api/state` | ✅ | Bulk-save state (legacy sync) |
| `GET` | `/api/admin/users` | ✅ Admin | List all users |
| `DELETE` | `/api/admin/users/{id}` | ✅ Admin | Delete a user |
| `GET` | `/api/admin/items` | ✅ Admin | List all items (admin) |
| `DELETE` | `/api/admin/items/{item_id}` | ✅ Admin | Delete an item (admin) |
| `POST` | `/api/contact` | — | Submit a contact form message |
| `GET` | `/api/health` | — | Health check |

---

## Deployment (Docker)

A `Dockerfile` is provided in the `backend/` directory. It includes Tesseract OCR and runs Alembic migrations before starting the server.

```bash
# Build the image
docker build -t xpiro-backend ./backend

# Run the container
docker run -d \
  --name xpiro \
  -p 8000:8000 \
  --env-file ./backend/.env \
  xpiro-backend
```

For a PostgreSQL backend, set `DATABASE_URL` in your `.env` to:

```
DATABASE_URL=postgresql://user:password@db-host:5432/xpiro
```

---

## Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository and create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. **Make your changes** and add tests in `backend/tests/` where applicable.
3. **Run the test suite** before submitting:
   ```bash
   cd backend
   pytest tests/
   ```
4. **Submit a pull request** against the `main` branch with a clear description of what was changed and why.

Please follow these guidelines:
- Keep pull requests focused on a single feature or fix.
- Use descriptive commit messages.
- Do not commit secrets, credentials, or compiled/binary files.

---

> Built with ❤️ to help keep track of what matters before it's too late.
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
