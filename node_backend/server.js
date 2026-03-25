const express = require("express");
const cors = require("cors");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { createWorker } = require("tesseract.js");
const nodemailer = require("nodemailer");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 5000;
const DB_PATH = path.join(__dirname, "xpiro.db");
const REMINDER_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const JWT_SECRET = process.env.JWT_SECRET || "xpiro-default-secret-change-in-production";
const JWT_EXPIRES_IN = "24h";

if (!process.env.JWT_SECRET) {
  console.warn("WARNING: JWT_SECRET environment variable is not set. Using insecure default secret. Set JWT_SECRET in production.");
}

const CATEGORY_WARN_DAYS = {
  medicine: 7,
  grocery: 2,
  dairy: 1,
  snacks: 3,
  beverage: 3,
  cosmetic: 14,
  cleaning: 7,
  other: 5,
};

function warnDaysForCategory(category) {
  return CATEGORY_WARN_DAYS[category] || CATEGORY_WARN_DAYS.other;
}

function daysUntilExpiry(expiryStr) {
  const exp = new Date(expiryStr);
  exp.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = exp - now;
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

function getItemStatus(item) {
  const days = daysUntilExpiry(item.expiry);
  if (days < 0) return "expired";
  if (days <= warnDaysForCategory(item.category)) return "soon";
  return "ok";
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getAlertKey(item, status) {
  const today = new Date().toISOString().slice(0, 10);
  return `${item.id}:${status}:${today}`;
}

function getSmtpTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

// Serve static frontend files from the root directory (one level up)
const ROOT_DIR = path.join(__dirname, "..");

const staticLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(staticLimiter);
app.use(express.static(ROOT_DIR));

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("Failed to open database", err);
    process.exit(1);
  }
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL UNIQUE,
      hashed_password TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)`);

  await run(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      state_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  const existing = await get("SELECT id FROM app_state WHERE id = 1");
  if (!existing) {
    const initialState = {
      items: [],
      history: [],
      alertedIds: [],
      emailedAlerts: [],
      profile: {
        firstName: process.env.USER_FIRST_NAME || "User",
        lastName: "",
        email: process.env.SMTP_USER || "",
        reminder: "app"
      },
      settings: { dark: true, notifications: true, email: false, ai: true },
      nextId: 1,
    };

    await run(
      "INSERT INTO app_state (id, state_json, updated_at) VALUES (1, ?, ?)",
      [JSON.stringify(initialState), Date.now()]
    );
  }
}

async function readStateRecord() {
  const row = await get("SELECT state_json, updated_at FROM app_state WHERE id = 1");
  if (!row) return null;
  const parsed = JSON.parse(row.state_json);
  if (!Array.isArray(parsed.emailedAlerts)) parsed.emailedAlerts = [];
  if (!Array.isArray(parsed.history)) parsed.history = [];
  if (!Array.isArray(parsed.items)) parsed.items = [];
  return { row, state: parsed };
}

async function writeState(state) {
  await run(
    "UPDATE app_state SET state_json = ?, updated_at = ? WHERE id = 1",
    [JSON.stringify(state), Date.now()]
  );
}

async function sendEmailReminder(recipient, item, status) {
  const transporter = getSmtpTransporter();
  if (!transporter) return false;

  const days = daysUntilExpiry(item.expiry);
  const statusLine =
    status === "expired"
      ? `${item.name} has expired.`
      : `${item.name} expires in ${days} day(s).`;

  const fromAddress = process.env.EMAIL_FROM || process.env.SMTP_USER;
  const subject = status === "expired" ? `Xpiro Alert: ${item.name} expired` : `Xpiro Alert: ${item.name} expiring soon`;

  await transporter.sendMail({
    from: fromAddress,
    to: recipient,
    subject,
    text: [
      "Xpiro Reminder",
      "",
      statusLine,
      `Item: ${item.name}`,
      `Category: ${item.category}`,
      `Expiry: ${formatDate(item.expiry)}`,
      "",
      "Open Xpiro to review your inventory.",
    ].join("\n"),
  });

  return true;
}

let reminderCheckInProgress = false;
async function checkAndSendEmailReminders() {
  if (reminderCheckInProgress) return;
  reminderCheckInProgress = true;

  try {
    const result = await readStateRecord();
    if (!result) return;

    const { state } = result;
    const recipient = state.profile?.email;
    const emailEnabled = !!state.settings?.email;
    if (!emailEnabled || !recipient) return;

    let changed = false;

    for (const item of state.items) {
      if (!item || !item.id || !item.expiry) continue;

      const wantsEmail = item.reminder === "email" || item.reminder === "both";
      if (!wantsEmail) continue;

      const status = getItemStatus(item);
      if (status !== "soon" && status !== "expired") continue;

      const alertKey = getAlertKey(item, status);
      if (state.emailedAlerts.includes(alertKey)) continue;

      const sent = await sendEmailReminder(recipient, item, status);
      if (!sent) break;

      state.emailedAlerts.push(alertKey);
      state.history.unshift({
        type: "remind",
        message: `Email reminder sent for "${item.name}" (${status})`,
        ts: Date.now(),
      });
      changed = true;
    }

    if (changed) {
      if (state.history.length > 100) state.history = state.history.slice(0, 100);
      await writeState(state);
    }
  } catch (error) {
    console.error("Email reminder check failed", error);
  } finally {
    reminderCheckInProgress = false;
  }
}

let ocrWorker = null;
async function getWorker() {
  if (!ocrWorker) {
    ocrWorker = await createWorker("eng");
  }
  return ocrWorker;
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "xpiro-backend" });
});

app.get("/api/state", async (req, res) => {
  try {
    const result = await readStateRecord();
    if (!result) return res.status(404).json({ error: "State not found" });
    res.json({ state: result.state, updatedAt: result.row.updated_at });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to read state" });
  }
});

app.put("/api/state", async (req, res) => {
  try {
    const incoming = req.body?.state;
    if (!incoming || typeof incoming !== "object") {
      return res.status(400).json({ error: "Invalid state payload" });
    }

    if (!Array.isArray(incoming.emailedAlerts)) incoming.emailedAlerts = [];
    await writeState(incoming);

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update state" });
  }
});

app.post("/api/reminders/check", async (req, res) => {
  await checkAndSendEmailReminders();
  res.json({ ok: true });
});

app.post("/scan", async (req, res) => {
  try {
    const base64 = req.body?.image;
    if (!base64 || typeof base64 !== "string") {
      return res.status(400).json({ error: "Image is required" });
    }

    const imageBuffer = Buffer.from(base64, "base64");
    const worker = await getWorker();
    const { data } = await worker.recognize(imageBuffer);

    res.json({ text: data?.text || "" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "OCR failed" });
  }
});

function requireAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ detail: "Authentication required" });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = parseInt(payload.sub, 10);
    next();
  } catch {
    return res.status(401).json({ detail: "Invalid or expired token" });
  }
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const { first_name = "", last_name = "", email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ detail: "Email and password are required." });
    }
    if (password.length < 8) {
      return res.status(422).json({ detail: "Password must be at least 8 characters." });
    }

    const existing = await get("SELECT id FROM users WHERE email = ?", [email.toLowerCase()]);
    if (existing) {
      return res.status(409).json({ detail: "Email already registered" });
    }

    const hashed_password = await bcrypt.hash(password, 10);
    const result = await run(
      "INSERT INTO users (first_name, last_name, email, hashed_password, created_at) VALUES (?, ?, ?, ?, ?)",
      [first_name, last_name, email.toLowerCase(), hashed_password, Date.now()]
    );

    res.status(201).json({
      id: result.lastID,
      first_name,
      last_name,
      email: email.toLowerCase(),
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ detail: "Internal server error" });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ detail: "Email and password are required." });
    }

    const user = await get("SELECT * FROM users WHERE email = ?", [username.toLowerCase()]);
    if (!user) {
      return res.status(401).json({ detail: "Incorrect email or password" });
    }

    const valid = await bcrypt.compare(password, user.hashed_password);
    if (!valid) {
      return res.status(401).json({ detail: "Incorrect email or password" });
    }

    const token = jwt.sign({ sub: String(user.id) }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.json({ access_token: token, token_type: "bearer" });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ detail: "Internal server error" });
  }
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    const user = await get(
      "SELECT id, first_name, last_name, email, created_at FROM users WHERE id = ?",
      [req.userId]
    );
    if (!user) {
      return res.status(404).json({ detail: "User not found" });
    }
    res.json(user);
  } catch (err) {
    console.error("Me error:", err);
    res.status(500).json({ detail: "Internal server error" });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(ROOT_DIR, "index.html"));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Xpiro backend running on http://127.0.0.1:${PORT}`);
    });
    checkAndSendEmailReminders();
    setInterval(checkAndSendEmailReminders, REMINDER_CHECK_INTERVAL_MS);
  })
  .catch((error) => {
    console.error("Database init failed", error);
    process.exit(1);
  });

process.on("SIGINT", async () => {
  try {
    if (ocrWorker) {
      await ocrWorker.terminate();
    }
  } catch (error) {
    console.error("Error terminating OCR worker", error);
  }

  db.close(() => process.exit(0));
});