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

Xpiro helps individuals and small businesses keep track of product expiry dates. Users scan a product label with their camera (or upload an image), and the app uses OCR to extract the product name, brand, and expiry date automatically. Items nearing expiry trigger in-app and email reminders so nothing goes to waste or becomes a health hazard.

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
| **OCR Scanning** | Upload or capture a product image; backend extracts text and parses expiry dates automatically |
| **Expiry Reminders** | Configurable per-item reminders (in-app and/or email); background job runs every 15 minutes |
| **Activity History** | Full audit log of adds, edits, deletes, and reminder events |
| **Admin Panel** | Manage all users and items; view system-wide statistics |
| **Contact Form** | Users can submit messages; forwarded to a configured support email address |
| **Dark / Light Theme** | Fully client-side theme engine driven by CSS variables |
| **Dashboard Stats** | Summary of expired, expiring soon, and good items |

---

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

> **Note:** The frontend calls the FastAPI backend at `http://localhost:8000` by default. Update the `API_BASE` constant in `index.html` if you change the backend port or deploy to a different host.

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
| `POST` | `/scan` | ✅ | OCR scan (base64 image → parsed data) |
| `GET` | `/api/reminders` | ✅ | List upcoming reminders |
| `POST` | `/api/reminders/check` | ✅ | Trigger reminder check & email delivery |
| `GET` | `/api/history` | ✅ | Get activity log |
| `GET` | `/api/state` | ✅ | Bulk-fetch state (legacy sync) |
| `PUT` | `/api/state` | ✅ | Bulk-save state (legacy sync) |
| `GET` | `/api/admin/users` | ✅ Admin | List all users |
| `DELETE` | `/api/admin/users/{id}` | ✅ Admin | Delete a user |
| `GET` | `/api/admin/stats` | ✅ Admin | System-wide statistics |
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
