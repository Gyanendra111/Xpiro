# Xpiro – Backend

A **FastAPI** backend for the Xpiro expiry-tracking application.  
It provides JWT authentication, full CRUD for tracked items, OCR-powered scan endpoint, email reminders, an admin panel, and a legacy compatibility layer for the existing frontend.

---

## Table of Contents

1. [Features](#features)
2. [Project Structure](#project-structure)
3. [Prerequisites](#prerequisites)
4. [Installation & Setup](#installation--setup)
5. [Environment Variables](#environment-variables)
6. [Database Migrations](#database-migrations)
7. [Running Locally](#running-locally)
8. [Running with Docker](#running-with-docker)
9. [API Documentation](#api-documentation)
   - [Health](#health)
   - [Authentication](#authentication)
   - [Items](#items)
   - [History](#history)
   - [Scan / OCR](#scan--ocr)
   - [Reminders](#reminders)
   - [State (Legacy)](#state-legacy)
   - [Contact](#contact)
   - [Admin](#admin)
10. [Testing](#testing)
11. [Deployment Notes](#deployment-notes)

---

## Features

| Feature | Details |
|---|---|
| **Authentication** | JWT-based registration & login; role-based admin access |
| **Item CRUD** | Create, read, update, delete tracked items with search, filtering, and sorting |
| **OCR Scan** | Accepts a base64 image and extracts text via Tesseract for auto-fill |
| **Email Reminders** | Category-aware warning thresholds; background scheduler sends emails via SMTP |
| **Activity History** | Automatic event log for every add / edit / delete / reminder action |
| **Legacy State API** | `/api/state` GET & PUT for seamless compatibility with the existing frontend |
| **Admin Panel** | List and delete any user or item (admin-only) |
| **Contact Form** | Forwards contact messages to a configured email address |
| **Docker Ready** | Single-container image that runs migrations and starts Uvicorn |

---

## Project Structure

```
backend/
├── app/
│   ├── main.py            # FastAPI app, CORS, lifespan, router registration
│   ├── config.py          # Pydantic settings loaded from .env
│   ├── database.py        # SQLAlchemy engine, session factory, Base
│   ├── models/            # ORM models (User, Item, HistoryEvent, ReminderAlert)
│   ├── schemas/           # Pydantic request/response schemas
│   ├── routes/            # One file per feature group
│   │   ├── auth.py
│   │   ├── items.py
│   │   ├── history.py
│   │   ├── scan.py
│   │   ├── reminders.py
│   │   ├── state.py
│   │   ├── contact.py
│   │   └── admin.py
│   └── utils/
│       ├── auth.py        # JWT helpers, password hashing, dependency injection
│       ├── email.py       # SMTP email sending
│       └── ocr.py         # Tesseract OCR wrapper
├── alembic/               # Database migration scripts
│   └── versions/
├── tests/
│   └── test_api.py        # pytest smoke tests
├── uploads/               # Placeholder for uploaded files
├── .env.example           # Template for environment variables
├── alembic.ini            # Alembic configuration
├── Dockerfile
└── requirements.txt
```

---

## Prerequisites

| Requirement | Version |
|---|---|
| Python | 3.10+ |
| pip | latest |
| Tesseract OCR | 4.x or 5.x (for the `/scan` endpoint) |

**Install Tesseract:**

```bash
# Debian / Ubuntu
sudo apt-get install -y tesseract-ocr

# macOS (Homebrew)
brew install tesseract

# Windows – download installer from https://github.com/UB-Mannheim/tesseract/wiki
```

---

## Installation & Setup

```bash
# 1. Clone the repository and move into the backend folder
git clone https://github.com/Gyanendra111/Xpiro.git
cd Xpiro/backend

# 2. Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Copy the environment template and edit it
cp .env.example .env
# Open .env in your editor and fill in the required values (see next section)
```

---

## Environment Variables

Copy [`.env.example`](.env.example) to `.env` and configure the following:

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./xpiro.db` | SQLAlchemy database URL. Use `postgresql://user:pass@host/db` for production |
| `SECRET_KEY` | *(required)* | Random string used to sign JWT tokens. **Change before deploying!** |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | JWT lifetime in minutes (default = 24 h) |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP server port |
| `SMTP_USER` | *(required for emails)* | SMTP login username |
| `SMTP_PASS` | *(required for emails)* | SMTP login password (use an app-specific password for Gmail) |
| `EMAIL_FROM` | *(required for emails)* | Sender display name and address, e.g. `Xpiro <noreply@example.com>` |
| `CONTACT_EMAIL` | *(falls back to `SMTP_USER`)* | Address that receives contact-form submissions |
| `ALLOWED_ORIGINS` | `http://localhost:5000,http://127.0.0.1:5000` | Comma-separated list of allowed CORS origins |

> **Tip:** Generate a strong `SECRET_KEY` with:
> ```bash
> python -c "import secrets; print(secrets.token_hex(32))"
> ```

---

## Database Migrations

The project uses [Alembic](https://alembic.sqlalchemy.org/) for schema migrations.

```bash
# Apply all pending migrations (creates the database on first run)
alembic upgrade head

# Create a new migration after changing a model
alembic revision --autogenerate -m "describe your change"

# Roll back the last migration
alembic downgrade -1
```

> **Development shortcut:** `app/main.py` calls `Base.metadata.create_all()` on startup, so the SQLite database is created automatically when running locally even without running Alembic. For production, always use `alembic upgrade head`.

---

## Running Locally

```bash
# Activate your virtual environment first
source .venv/bin/activate

# Apply migrations (first time or after a schema change)
alembic upgrade head

# Start the development server with hot-reload
uvicorn app.main:app --reload --port 8000
```

The API is now available at `http://localhost:8000`.  
The interactive **Swagger UI** docs are at `http://localhost:8000/docs`.  
The **ReDoc** docs are at `http://localhost:8000/redoc`.

---

## Running with Docker

```bash
# Build the image
docker build -t xpiro-backend .

# Run the container
docker run -d \
  --name xpiro \
  -p 8000:8000 \
  --env-file .env \
  xpiro-backend
```

The Docker container automatically runs `alembic upgrade head` before starting Uvicorn.

**Override the database path to persist data outside the container:**

```bash
docker run -d \
  --name xpiro \
  -p 8000:8000 \
  --env-file .env \
  -e DATABASE_URL=sqlite:////data/xpiro.db \
  -v $(pwd)/data:/data \
  xpiro-backend
```

---

## API Documentation

Full interactive documentation is available via Swagger UI at `/docs` when the server is running.

### Authentication

All protected endpoints require a `Bearer` token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | No | Returns `{"ok": true}` |

---

### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | No | Register a new user |
| `POST` | `/api/auth/login` | No | Log in and receive a JWT access token |
| `GET` | `/api/auth/me` | Yes | Return the currently authenticated user's profile |

**Register – request body:**
```json
{
  "email": "user@example.com",
  "password": "strongpassword",
  "first_name": "Ada",
  "last_name": "Lovelace"
}
```

**Login – form data (`application/x-www-form-urlencoded`):**
```
username=user@example.com&password=strongpassword
```

**Login – response:**
```json
{
  "access_token": "<jwt>",
  "token_type": "bearer"
}
```

---

### Items

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/items` | Yes | List items with optional filters |
| `POST` | `/api/items` | Yes | Create a new item |
| `GET` | `/api/items/{id}` | Yes | Retrieve a single item |
| `PUT` | `/api/items/{id}` | Yes | Update an item (partial update supported) |
| `DELETE` | `/api/items/{id}` | Yes | Delete an item |

**`GET /api/items` query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `search` | string | Filter by name or brand (case-insensitive) |
| `category` | string | Filter by category (e.g. `dairy`, `medicine`) |
| `status` | string | Filter by computed status: `ok`, `soon`, or `expired` |
| `sort_by` | string | Sort field: `expiry` (default), `name`, `created_at` |
| `order` | string | `asc` (default) or `desc` |
| `skip` | int | Pagination offset (default `0`) |
| `limit` | int | Page size (default `100`, max `500`) |

**Create/Update item schema:**
```json
{
  "name": "Milk",
  "category": "dairy",
  "expiry": "2025-12-31",
  "brand": "Amul",
  "reminder": "app"
}
```

> `reminder` values: `app`, `email`, `both`, or `none`.

---

### History

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/history` | Yes | List activity events (newest first) |

**Query parameters:** `skip`, `limit` (same semantics as items).

---

### Scan / OCR

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/scan` | No | Extract text from a base64-encoded image |

**Request body:**
```json
{
  "image": "<base64-encoded image, with or without data-URL prefix>"
}
```

**Response:**
```json
{
  "text": "Best before 31/12/2025\nMilk 1L..."
}
```

> Requires Tesseract to be installed on the host system.

---

### Reminders

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/reminders/check` | Yes | Trigger email reminders for the current user's expiring items |

**Response:**
```json
{
  "ok": true,
  "sent": 3
}
```

Category-specific warning thresholds (days before expiry):

| Category | Warning Days |
|---|---|
| Medicine | 7 |
| Cosmetic | 14 |
| Cleaning | 7 |
| Snacks | 3 |
| Beverage | 3 |
| Grocery | 2 |
| Dairy | 1 |
| Other | 5 |

A background scheduler also runs this check every hour for all users automatically.

---

### State (Legacy)

These endpoints provide full compatibility with the original Node.js frontend without any frontend changes.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/state` | Yes | Returns the full state object (items, history, profile, settings, alertedIds) |
| `PUT` | `/api/state` | Yes | Accepts a partial state update (profile and settings fields are persisted) |

---

### Contact

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/contact` | No | Submit a contact form message |

**Request body:**
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "message": "Hello, I need help with…"
}
```

---

### Admin

Admin endpoints require the authenticated user to have `is_admin = true` in the database.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/admin/users` | Admin | List all registered users |
| `DELETE` | `/api/admin/users/{id}` | Admin | Delete a user (and their data) |
| `GET` | `/api/admin/items` | Admin | List all items across all users |
| `DELETE` | `/api/admin/items/{id}` | Admin | Delete any item |

> **Promote a user to admin** (SQLite example):
> ```bash
> sqlite3 xpiro.db "UPDATE user SET is_admin = 1 WHERE email = 'admin@example.com';"
> ```

---

## Testing

The test suite uses [pytest](https://docs.pytest.org/) with FastAPI's built-in `TestClient` and an in-memory SQLite database.

```bash
# Install test dependencies (already included in requirements.txt)
pip install pytest

# Run all tests from the backend directory
cd backend
pytest tests/ -v
```

The tests cover:

- Health check endpoint
- User registration, login, and `/me`
- Item CRUD (create, list, get, update, delete)
- Activity history
- Legacy `/api/state` GET and PUT
- Scan endpoint (with and without a valid image)
- Reminder check endpoint

---

## Deployment Notes

### Production Database

Switch from SQLite to PostgreSQL by updating `DATABASE_URL` in your production `.env`:

```
DATABASE_URL=postgresql://xpiro_user:strongpassword@db-host:5432/xpiro
```

Install the async driver:

```bash
pip install psycopg2-binary   # or asyncpg for async usage
```

### Security

- **Always** set a strong, unique `SECRET_KEY` in production. Never commit it to version control.
- Set `ALLOWED_ORIGINS` to your exact frontend domain(s) to restrict CORS.
- Use HTTPS in production (e.g., via an Nginx reverse proxy or a cloud load balancer).

### Running Behind a Reverse Proxy (Nginx)

```nginx
location /api/ {
    proxy_pass         http://127.0.0.1:8000;
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
}
```

### Scaling with Gunicorn + Uvicorn Workers

```bash
pip install gunicorn
gunicorn app.main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000
```

### Tesseract in Production

Ensure Tesseract is installed on the server or in the Docker image (already included in the provided `Dockerfile`).

```bash
# Verify installation
tesseract --version
```
