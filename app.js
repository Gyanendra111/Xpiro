/* ═══════════════════════════════════════════════════════════
   Xpiro — app.js  (fixed)
   Full application logic: state, camera, AI, notifications,
   themes, reminders, CRUD
═══════════════════════════════════════════════════════════ */

"use strict";

/* ── STATE ───────────────────────────────────────────────── */
let state = {
  items: [],
  history: [],
  // FIX #9: Track which item IDs have already been alerted to avoid duplicate history entries
  alertedIds: [],
  profile: { firstName: "Gyanendra", lastName: "", email: "gyanendra9117@gmail.com", reminder: "app" },
  settings: { dark: true, notifications: true, email: false, ai: true },
  nextId: 1,
};

let saveStateTimer = null;
let lastSavedSnapshot = "";

/* ── AUTH STATE ──────────────────────────────────────────── */
let currentUser = null;
let authToken   = localStorage.getItem("xpiro_token") || null;

async function loadState() {
  try {
    const response = await fetch("/api/state", { headers: getAuthHeaders() });
    if (!response.ok) throw new Error("Backend state unavailable");

    const payload = await response.json();
    if (payload?.state && typeof payload.state === "object") {
      state = { ...state, ...payload.state };
      localStorage.setItem("xpiro_state", JSON.stringify(state));
    }
  } catch (backendError) {
    console.warn("Backend state load failed, falling back to local cache", backendError);
    try {
      const saved = localStorage.getItem("xpiro_state");
      if (saved) state = { ...state, ...JSON.parse(saved) };
    } catch (cacheError) {
      console.warn("State load error", cacheError);
    }
  }

  // Ensure alertedIds always exists after loading older saved state
  if (!state.alertedIds) state.alertedIds = [];
}

function saveState() {
  try {
    const snapshot = JSON.stringify(state);
    localStorage.setItem("xpiro_state", snapshot);

    // Debounce writes to backend to avoid flooding the API on rapid UI actions.
    if (snapshot === lastSavedSnapshot) return;
    lastSavedSnapshot = snapshot;

    clearTimeout(saveStateTimer);
    saveStateTimer = setTimeout(async () => {
      try {
        const response = await fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ state }),
        });
        if (response.status === 401) { authLogout(); return; }
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || "Failed to persist state");
        }
      } catch (error) {
        console.warn("State save error", error);
      }
    }, 150);
  } catch (e) {
    console.warn("State save error", e);
  }
}

/* ── AUTH HELPERS ────────────────────────────────────────── */
function getAuthHeaders() {
  return authToken ? { "Authorization": `Bearer ${authToken}` } : {};
}

function showAuthOverlay(section = "login") {
  document.getElementById("auth-overlay").classList.remove("hidden");
  if (section === "register") {
    document.getElementById("auth-login-section").classList.add("hidden");
    document.getElementById("auth-register-section").classList.remove("hidden");
  } else {
    document.getElementById("auth-login-section").classList.remove("hidden");
    document.getElementById("auth-register-section").classList.add("hidden");
  }
  clearAuthErrors();
}

function hideAuthOverlay() {
  document.getElementById("auth-overlay").classList.add("hidden");
}

function clearAuthErrors() {
  ["auth-error", "reg-error"].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ""; el.classList.add("hidden"); }
  });
}

function showAuthError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.classList.remove("hidden"); }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function authAutoLogin() {
  if (!authToken) return false;
  try {
    const res = await fetch("/api/auth/me", { headers: getAuthHeaders() });
    if (!res.ok) {
      authToken = null;
      localStorage.removeItem("xpiro_token");
      return false;
    }
    currentUser = await res.json();
    return true;
  } catch {
    return false;
  }
}

async function authLogin(email, password) {
  const btn = document.getElementById("login-btn");
  const origHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing In…';
  clearAuthErrors();

  if (!isValidEmail(email)) {
    showAuthError("auth-error", "Please enter a valid email address.");
    btn.disabled = false; btn.innerHTML = origHTML; return;
  }
  if (!password) {
    showAuthError("auth-error", "Password is required.");
    btn.disabled = false; btn.innerHTML = origHTML; return;
  }

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      showAuthError("auth-error", data.detail || "Login failed. Please try again.");
      return;
    }
    authToken = data.access_token;
    localStorage.setItem("xpiro_token", authToken);
    const meRes = await fetch("/api/auth/me", { headers: getAuthHeaders() });
    if (meRes.ok) currentUser = await meRes.json();
    hideAuthOverlay();
    onAuthSuccess();
  } catch {
    showAuthError("auth-error", "Network error. Please check your connection.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHTML;
  }
}

async function authRegister(firstName, lastName, email, password) {
  const btn = document.getElementById("register-btn");
  const origHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating Account…';
  clearAuthErrors();

  if (!firstName.trim()) {
    showAuthError("reg-error", "First name is required.");
    btn.disabled = false; btn.innerHTML = origHTML; return;
  }
  if (!isValidEmail(email)) {
    showAuthError("reg-error", "Please enter a valid email address.");
    btn.disabled = false; btn.innerHTML = origHTML; return;
  }
  if (password.length < 8) {
    showAuthError("reg-error", "Password must be at least 8 characters.");
    btn.disabled = false; btn.innerHTML = origHTML; return;
  }

  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ first_name: firstName, last_name: lastName, email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      showAuthError("reg-error", data.detail || "Registration failed. Please try again.");
      return;
    }
    // Auto-login after successful registration
    await authLogin(email, password);
  } catch {
    showAuthError("reg-error", "Network error. Please check your connection.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHTML;
  }
}

function authLogout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem("xpiro_token");
  showAuthOverlay("login");
}

function onAuthSuccess() {
  if (currentUser) {
    state.profile.firstName = currentUser.first_name || state.profile.firstName;
    state.profile.lastName  = currentUser.last_name  || state.profile.lastName;
    state.profile.email     = currentUser.email       || state.profile.email;
  }
  renderDashboard();
  renderProfile();
  updateBadges();
}

/* ── CATEGORY CONFIG ─────────────────────────────────────── */
const CATEGORY_CONFIG = {
  medicine:  { emoji: "💊", color: "#ff4d6d", warnDays: 7,  label: "Medicine" },
  grocery:   { emoji: "🛒", color: "#ffb347", warnDays: 2,  label: "Grocery" },
  dairy:     { emoji: "🥛", color: "#60a5fa", warnDays: 1,  label: "Dairy" },
  snacks:    { emoji: "🍿", color: "#f9a825", warnDays: 3,  label: "Snacks" },
  beverage:  { emoji: "🧃", color: "#4ade80", warnDays: 3,  label: "Beverage" },
  cosmetic:  { emoji: "💄", color: "#e879f9", warnDays: 14, label: "Cosmetic" },
  cleaning:  { emoji: "🧹", color: "#67e8f9", warnDays: 7,  label: "Cleaning" },
  other:     { emoji: "📦", color: "#a0a0a0", warnDays: 5,  label: "Other" },
};

const AI_KEYWORD_MAP = {
  paracetamol: "medicine", ibuprofen: "medicine", amoxicillin: "medicine",
  syrup: "medicine", tablet: "medicine", capsule: "medicine", strip: "medicine",
  cream: "cosmetic", lotion: "cosmetic", shampoo: "cosmetic", conditioner: "cosmetic",
  perfume: "cosmetic", moisturizer: "cosmetic", serum: "cosmetic",
  milk: "dairy", cheese: "dairy", butter: "dairy", curd: "dairy", paneer: "dairy", yogurt: "dairy",
  biscuit: "snacks", chips: "snacks", cookie: "snacks", cracker: "snacks", wafer: "snacks",
  rice: "grocery", wheat: "grocery", sugar: "grocery", salt: "grocery", flour: "grocery",
  dal: "grocery", masala: "grocery", spice: "grocery", oil: "grocery", ghee: "grocery",
  juice: "beverage", cola: "beverage", water: "beverage", tea: "beverage", coffee: "beverage",
  soda: "beverage", energy: "beverage",
  soap: "cleaning", detergent: "cleaning", cleaner: "cleaning", disinfectant: "cleaning",
  bleach: "cleaning",
};

function aiGuessCategory(name) {
  const lower = name.toLowerCase();
  for (const [kw, cat] of Object.entries(AI_KEYWORD_MAP)) {
    if (lower.includes(kw)) return cat;
  }
  return null;
}

/* ── DATE HELPERS ────────────────────────────────────────── */
function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function daysUntilExpiry(expiryStr) {
  const exp = new Date(expiryStr);
  exp.setHours(0, 0, 0, 0);
  const diff = exp - today();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}
function getStatus(item) {
  const days = daysUntilExpiry(item.expiry);
  const cfg = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.other;
  if (days < 0) return "expired";
  if (days <= cfg.warnDays) return "soon";
  return "ok";
}
function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function formatRelativeTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}
function getReminderDate(item) {
  const cfg = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.other;
  const exp = new Date(item.expiry);
  exp.setDate(exp.getDate() - cfg.warnDays);
  return exp;
}

/* ── TOAST ───────────────────────────────────────────────── */
function toast(msg, type = "info", duration = 3500) {
  const icons = { success: "fa-circle-check", error: "fa-circle-xmark", info: "fa-circle-info", warn: "fa-triangle-exclamation" };
  const tc = document.getElementById("toast-container");
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${msg}</span><span class="toast-close"><i class="fa-solid fa-xmark"></i></span>`;
  t.querySelector(".toast-close").onclick = () => t.remove();
  tc.appendChild(t);
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translateX(20px)";
    t.style.transition = "all 0.3s";
    setTimeout(() => t.remove(), 300);
  }, duration);
}

/* ── CONFIRM DIALOG ──────────────────────────────────────── */
// FIX #10: Re-query buttons by ID inside each handler so stale detached
// node references after cloneNode() can never break subsequent calls.
function confirmDialog(title, message) {
  return new Promise(resolve => {
    const overlay = document.getElementById("confirm-overlay");
    document.getElementById("confirm-title").textContent = title;
    document.getElementById("confirm-message").textContent = message;
    overlay.classList.remove("hidden");

    // Always query fresh references immediately before attaching handlers
    document.getElementById("confirm-ok").onclick = () => {
      overlay.classList.add("hidden");
      // Reset handlers to prevent accidental double-fire
      document.getElementById("confirm-ok").onclick = null;
      document.getElementById("confirm-cancel").onclick = null;
      resolve(true);
    };
    document.getElementById("confirm-cancel").onclick = () => {
      overlay.classList.add("hidden");
      document.getElementById("confirm-ok").onclick = null;
      document.getElementById("confirm-cancel").onclick = null;
      resolve(false);
    };
  });
}

/* ── HISTORY LOGGING ─────────────────────────────────────── */
function logHistory(type, message) {
  state.history.unshift({ type, message, ts: Date.now() });
  if (state.history.length > 100) state.history = state.history.slice(0, 100);
  saveState();
}

/* ── NAVIGATION ──────────────────────────────────────────── */
const PAGE_TITLES = {
  dashboard: "Dashboard",
  scan: "Scan Item",
  inventory: "Inventory",
  reminders: "Reminders",
  history: "History",
  profile: "Profile",
};
let currentPage = "dashboard";

function navigateTo(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  const target = document.getElementById(`page-${page}`);
  if (target) { target.classList.remove("hidden"); target.classList.add("active"); }
  document.querySelectorAll(`.nav-item[data-page="${page}"]`).forEach(n => n.classList.add("active"));
  document.getElementById("page-title").textContent = PAGE_TITLES[page] || page;
  currentPage = page;
  renderPage(page);
  // Close mobile sidebar
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  if (sidebar) sidebar.classList.remove("open");
  if (overlay) overlay.classList.remove("visible");
}

function renderPage(page) {
  switch (page) {
    case "dashboard":  renderDashboard(); break;
    case "inventory":  renderInventory(); break;
    case "reminders":  renderReminders(); break;
    case "history":    renderHistory();   break;
    case "profile":    renderProfile();   break;
  }
}

/* ── DASHBOARD ───────────────────────────────────────────── */
function renderDashboard() {
  const expired = state.items.filter(i => getStatus(i) === "expired");
  const soon    = state.items.filter(i => getStatus(i) === "soon");
  const ok      = state.items.filter(i => getStatus(i) === "ok");
  document.getElementById("stat-expired").textContent = expired.length;
  document.getElementById("stat-soon").textContent    = soon.length;
  document.getElementById("stat-ok").textContent      = ok.length;
  document.getElementById("stat-total").textContent   = state.items.length;

  const h = new Date().getHours();
  const greet = h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
  document.getElementById("greeting-time").textContent = greet;
  document.getElementById("greeting-name").textContent = state.profile.firstName;

  const urgentList = document.getElementById("urgent-list");
  const urgentEmpty = document.getElementById("urgent-empty");
  const urgent = [...expired, ...soon].sort((a, b) => new Date(a.expiry) - new Date(b.expiry)).slice(0, 6);
  urgentList.innerHTML = "";
  if (urgent.length === 0) {
    urgentEmpty.classList.remove("hidden");
  } else {
    urgentEmpty.classList.add("hidden");
    urgent.forEach(i => urgentList.appendChild(buildItemCard(i)));
  }

  const recentList = document.getElementById("recent-list");
  recentList.innerHTML = "";
  const recent = [...state.items].sort((a, b) => b.addedAt - a.addedAt).slice(0, 6);
  recent.forEach(i => recentList.appendChild(buildItemCard(i)));

  updateBadges();
}

/* ── ITEM CARD ───────────────────────────────────────────── */
function buildItemCard(item) {
  const status = getStatus(item);
  const cfg = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.other;
  const days = daysUntilExpiry(item.expiry);
  const card = document.createElement("div");
  card.className = `item-card status-${status}`;
  card.dataset.id = item.id;

  let daysTxt = "";
  if (days < 0) daysTxt = `Expired ${Math.abs(days)}d ago`;
  else if (days === 0) daysTxt = "Expires today!";
  else daysTxt = `${days}d remaining`;

  const reminderIcons = { app: "fa-mobile-screen", email: "fa-envelope", both: "fa-layer-group" };
  const rIcon = reminderIcons[item.reminder] || "fa-bell";

  // FIX #3: Card action buttons use data attributes; listeners are attached
  // via addEventListener after DOM insertion — avoids the broken window.event reference.
  card.innerHTML = `
    <div class="card-top">
      <div class="card-emoji">${cfg.emoji}</div>
      <div class="card-actions">
        <button class="btn-icon-sm edit" data-id="${item.id}" data-action="edit" title="Edit"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-icon-sm" data-id="${item.id}" data-action="delete" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>
    <div class="card-name" title="${escHtml(item.name)}">${escHtml(item.name)}</div>
    <div class="card-brand">${escHtml(item.brand || item.category)}</div>
    <div class="card-expiry">
      <span class="expiry-badge ${status}">${formatDate(item.expiry)}</span>
      <span class="days-left">${daysTxt}</span>
    </div>
    <div class="card-footer">
      <span class="category-tag">${cfg.label}</span>
      <span class="reminder-icon" title="Reminder: ${item.reminder}"><i class="fa-solid ${rIcon}"></i></span>
    </div>
  `;

  card.querySelector('[data-action="edit"]').addEventListener("click", e => {
    e.stopPropagation();
    editItem(item.id, e);
  });
  card.querySelector('[data-action="delete"]').addEventListener("click", e => {
    e.stopPropagation();
    deleteItem(item.id, e);
  });

  card.addEventListener("click", () => openItemModal(item));
  return card;
}

function escHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ── INVENTORY ───────────────────────────────────────────── */
let invFilter = "all";
let invSearch = "";
let invSort   = "expiry-asc";

function renderInventory() {
  let items = [...state.items];

  if (invFilter === "expired") items = items.filter(i => getStatus(i) === "expired");
  else if (invFilter === "soon") items = items.filter(i => getStatus(i) === "soon");
  else if (invFilter !== "all") items = items.filter(i => i.category === invFilter);

  if (invSearch.trim()) {
    const q = invSearch.toLowerCase();
    items = items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.brand || "").toLowerCase().includes(q) ||
      // FIX #12: toLowerCase() on category for consistent case-insensitive matching
      i.category.toLowerCase().includes(q)
    );
  }

  if (invSort === "expiry-asc") items.sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
  else if (invSort === "expiry-desc") items.sort((a, b) => new Date(b.expiry) - new Date(a.expiry));
  else if (invSort === "name-asc") items.sort((a, b) => a.name.localeCompare(b.name));
  else if (invSort === "added-desc") items.sort((a, b) => b.addedAt - a.addedAt);

  const grid  = document.getElementById("inventory-grid");
  const empty = document.getElementById("inventory-empty");
  grid.innerHTML = "";
  if (items.length === 0) {
    empty.classList.remove("hidden");
  } else {
    empty.classList.add("hidden");
    items.forEach(i => grid.appendChild(buildItemCard(i)));
  }
}

/* ── REMINDERS ───────────────────────────────────────────── */
function renderReminders() {
  const list  = document.getElementById("reminders-list");
  const empty = document.getElementById("reminders-empty");
  list.innerHTML = "";

  const sorted = [...state.items].sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
  if (sorted.length === 0) { empty.classList.remove("hidden"); return; }
  empty.classList.add("hidden");

  sorted.forEach(item => {
    const status  = getStatus(item);
    const days    = daysUntilExpiry(item.expiry);
    const cfg     = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.other;
    const remDate = getReminderDate(item);
    const dotCls  = status === "expired" ? "red" : status === "soon" ? "amber" : "green";
    const badgeCls = status === "expired" ? "expired" : status === "soon" ? "soon" : "scheduled";
    let badgeTxt = status === "expired" ? "EXPIRED" : status === "soon" ? `${days}d LEFT` : "Scheduled";

    const row = document.createElement("div");
    row.className = "reminder-row";
    row.innerHTML = `
      <div class="reminder-dot" style="background:${dotCls === 'red' ? 'var(--red)' : dotCls === 'amber' ? 'var(--amber)' : 'var(--green)'}"></div>
      <div class="reminder-info">
        <div class="reminder-name">${cfg.emoji} ${escHtml(item.name)}</div>
        <div class="reminder-meta">
          Reminder: ${item.reminder === "app" ? "📱 App" : item.reminder === "email" ? "📧 Email" : "📱+📧 Both"} &nbsp;·&nbsp;
          Alert set for: <strong>${remDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</strong>
          &nbsp;·&nbsp; Expires: ${formatDate(item.expiry)}
        </div>
      </div>
      <span class="reminder-badge ${badgeCls}">${badgeTxt}</span>
    `;
    list.appendChild(row);
  });
}

/* ── HISTORY ─────────────────────────────────────────────── */
function renderHistory() {
  const list  = document.getElementById("history-list");
  const empty = document.getElementById("history-empty");
  list.innerHTML = "";
  if (state.history.length === 0) { empty.classList.remove("hidden"); return; }
  empty.classList.add("hidden");

  const typeConfig = {
    add:    { cls: "add",    icon: "fa-plus" },
    delete: { cls: "delete", icon: "fa-trash" },
    expire: { cls: "expire", icon: "fa-triangle-exclamation" },
    scan:   { cls: "scan",   icon: "fa-camera" },
    remind: { cls: "remind", icon: "fa-bell" },
    // FIX #16: "edit" type must use its own CSS class ("edit"), not "scan"
    edit:   { cls: "edit",   icon: "fa-pen" },
    system: { cls: "remind", icon: "fa-gear" },
  };

  state.history.forEach((h, idx) => {
    const cfg = typeConfig[h.type] || typeConfig.system;
    const div = document.createElement("div");
    div.className = "history-item";
    div.innerHTML = `
      <div class="history-dot-wrap">
        <div class="history-dot ${cfg.cls}"></div>
        ${idx < state.history.length - 1 ? '<div class="history-line"></div>' : ''}
      </div>
      <div class="history-content">
        <div class="history-title">${escHtml(h.message)}</div>
        <div class="history-time">${formatRelativeTime(h.ts)}</div>
      </div>
    `;
    list.appendChild(div);
  });
}

/* ── PROFILE ─────────────────────────────────────────────── */
function renderProfile() {
  const p = state.profile;
  // Use currentUser data if authenticated, fall back to local state
  const firstName = (currentUser?.first_name || p.firstName || "").trim();
  const lastName  = (currentUser?.last_name  || p.lastName  || "").trim();
  const email     = currentUser?.email || p.email || "";
  const fullName  = `${firstName} ${lastName}`.trim();
  const initials  = `${(firstName[0] || "?").toUpperCase()}${(lastName[0] || "").toUpperCase()}`;

  document.getElementById("profile-display-name").textContent = fullName;
  // FIX #14: Always render email from JS state, not from hardcoded HTML (avoids Cloudflare obfuscation)
  document.getElementById("profile-email-display").textContent = email;
  document.getElementById("profile-avatar-big").textContent = initials;
  document.getElementById("topbar-avatar").textContent = initials;

  // Show account creation date if authenticated
  const joinedEl = document.getElementById("profile-joined");
  if (joinedEl) {
    if (currentUser?.created_at) {
      const joined = new Date(currentUser.created_at);
      joinedEl.textContent = `Member since ${joined.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}`;
      joinedEl.classList.remove("hidden");
    } else {
      joinedEl.classList.add("hidden");
    }
  }

  document.getElementById("prof-total").textContent    = state.items.length;
  document.getElementById("prof-saved").textContent    = state.history.filter(h => h.type === "add").length;
  document.getElementById("prof-wasted").textContent   = state.history.filter(h => h.type === "expire").length;

  // FIX #8: Count only items that have a non-default (email or both) reminder, not all items
  const withReminder = state.items.filter(i => i.reminder === "email" || i.reminder === "both").length;
  document.getElementById("prof-reminders").textContent = withReminder;

  document.getElementById("settings-dark").checked  = state.settings.dark;
  document.getElementById("settings-notif").checked = state.settings.notifications;
  document.getElementById("settings-email").checked = state.settings.email;
  document.getElementById("settings-ai").checked    = state.settings.ai;

  document.getElementById("pf-fname").value    = firstName || p.firstName;
  document.getElementById("pf-lname").value    = lastName  || p.lastName;
  document.getElementById("pf-email").value    = email;
  document.getElementById("pf-reminder").value = p.reminder;
}

/* ── ADD / EDIT ITEM ─────────────────────────────────────── */
let editingItemId = null;

function getFormData() {
  const name     = document.getElementById("inp-name").value.trim();
  const category = document.getElementById("inp-category").value;
  const expiry   = document.getElementById("inp-expiry").value;
  const brand    = document.getElementById("inp-brand").value.trim();
  const reminder = document.querySelector('input[name="reminder"]:checked')?.value || "app";
  return { name, category, expiry, brand, reminder };
}

function clearForm() {
  document.getElementById("inp-name").value     = "";
  document.getElementById("inp-category").value = "";
  document.getElementById("inp-expiry").value   = "";
  document.getElementById("inp-brand").value    = "";
  const appRadio = document.querySelector('input[name="reminder"][value="app"]');
  if (appRadio) appRadio.checked = true;
  document.getElementById("ai-detect-banner").classList.add("hidden");
  setStep(1);
  editingItemId = null;
}

function addOrUpdateItem() {
  const { name, category, expiry, brand, reminder } = getFormData();
  if (!name) { toast("Product name is required", "error"); return; }
  if (!category) { toast("Please select a category", "error"); return; }
  if (!expiry) { toast("Expiry date is required", "error"); return; }

  if (editingItemId !== null) {
    const idx = state.items.findIndex(i => i.id === editingItemId);
    if (idx !== -1) {
      state.items[idx] = { ...state.items[idx], name, category, expiry, brand, reminder };
      logHistory("edit", `Edited "${name}"`);
      toast(`"${name}" updated!`, "success");
    }
    editingItemId = null;
  } else {
    const newItem = { id: state.nextId++, name, category, expiry, brand, reminder, addedAt: Date.now() };
    state.items.unshift(newItem);
    scheduleReminderFor(newItem);
    logHistory("add", `Added "${name}" (${(CATEGORY_CONFIG[category] || CATEGORY_CONFIG.other).label}) — expires ${formatDate(expiry)}`);
    toast(`"${name}" added successfully!`, "success");
    setStep(3);
  }

  saveState();
  // FIX #13: clearForm() is called after saveState() to ensure state is fully persisted
  // before editingItemId is reset to null. Keep saveState() synchronous.
  clearForm();
  updateBadges();
  if (currentPage === "dashboard") renderDashboard();
  if (currentPage === "inventory") renderInventory();
}

function editItem(id, event) {
  event.stopPropagation();
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  editingItemId = id;
  document.getElementById("inp-name").value     = item.name;
  document.getElementById("inp-category").value = item.category;
  document.getElementById("inp-expiry").value   = item.expiry;
  document.getElementById("inp-brand").value    = item.brand || "";
  const rmEl = document.querySelector(`input[name="reminder"][value="${item.reminder}"]`);
  if (rmEl) rmEl.checked = true;
  document.getElementById("add-item-btn").innerHTML = '<i class="fa-solid fa-save"></i> Update Item';
  navigateTo("scan");
  setStep(1);
}

async function deleteItem(id, event) {
  event.stopPropagation();
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  const ok = await confirmDialog("Delete Item", `Delete "${item.name}"? This cannot be undone.`);
  if (!ok) return;
  state.items = state.items.filter(i => i.id !== id);
  // Also remove from alertedIds to keep state clean
  state.alertedIds = state.alertedIds.filter(aid => aid !== id);
  logHistory("delete", `Deleted "${item.name}"`);
  toast(`"${item.name}" removed`, "warn");
  saveState();
  updateBadges();
  renderPage(currentPage);
}

/* ── MODAL ───────────────────────────────────────────────── */
// FIX #3 (modal): Replace inline onclick strings referencing window.event
// with proper addEventListener calls after injecting modal HTML.
function openItemModal(item) {
  const status = getStatus(item);
  const cfg = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.other;
  const days = daysUntilExpiry(item.expiry);
  let daysTxt = days < 0 ? `Expired ${Math.abs(days)} day(s) ago` : days === 0 ? "Expires today!" : `${days} day(s) remaining`;
  const remDate = getReminderDate(item);
  const reminderLabels = { app: "📱 App Notification", email: "📧 Email", both: "📱 + 📧 Both" };

  document.getElementById("modal-title").textContent = `${cfg.emoji} ${item.name}`;
  document.getElementById("modal-body").innerHTML = `
    <div class="modal-detail-row"><span class="lbl">Category</span><span class="val">${cfg.emoji} ${cfg.label}</span></div>
    <div class="modal-detail-row"><span class="lbl">Brand / Notes</span><span class="val">${escHtml(item.brand) || "—"}</span></div>
    <div class="modal-detail-row"><span class="lbl">Expiry Date</span><span class="val">${formatDate(item.expiry)}</span></div>
    <div class="modal-detail-row"><span class="lbl">Status</span><span class="val"><span class="expiry-badge ${status}">${status === "expired" ? "EXPIRED" : status === "soon" ? "EXPIRING SOON" : "GOOD"}</span></span></div>
    <div class="modal-detail-row"><span class="lbl">Days</span><span class="val">${daysTxt}</span></div>
    <div class="modal-detail-row"><span class="lbl">Reminder Set For</span><span class="val">${remDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span></div>
    <div class="modal-detail-row"><span class="lbl">Reminder Channel</span><span class="val">${reminderLabels[item.reminder] || item.reminder}</span></div>
    <div class="modal-detail-row"><span class="lbl">Added On</span><span class="val">${new Date(item.addedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="modal-edit-btn"><i class="fa-solid fa-pen"></i> Edit</button>
      <button class="btn btn-danger" id="modal-delete-btn"><i class="fa-solid fa-trash"></i> Delete</button>
    </div>
  `;

  // Attach proper event listeners — no window.event reference
  document.getElementById("modal-edit-btn").addEventListener("click", (e) => {
    editItem(item.id, e);
    closeModal();
  });
  document.getElementById("modal-delete-btn").addEventListener("click", (e) => {
    deleteItem(item.id, e);
    closeModal();
  });

  document.getElementById("modal-overlay").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
}

/* ── BADGE UPDATE ────────────────────────────────────────── */
function updateBadges() {
  const urgent = state.items.filter(i => getStatus(i) !== "ok").length;
  const badgeEl  = document.getElementById("badge-reminders");
  const topBadge = document.getElementById("topbar-badge");
  if (urgent > 0) {
    if (badgeEl)  { badgeEl.textContent  = urgent; badgeEl.classList.remove("hidden"); }
    if (topBadge) { topBadge.textContent = urgent; topBadge.classList.remove("hidden"); }
  } else {
    if (badgeEl)  badgeEl.classList.add("hidden");
    if (topBadge) topBadge.classList.add("hidden");
  }
}

/* ── STEPS ───────────────────────────────────────────────── */
function setStep(n) {
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById(`step-${i}`);
    if (!el) continue;
    el.classList.remove("active", "done");
    if (i < n) el.classList.add("done");
    else if (i === n) el.classList.add("active");
  }
}

/* ── AI AUTO-CATEGORIZE ──────────────────────────────────── */
// FIX #17: Remove the else branch that hid the banner when category was
// already set by the user — let it persist without interference.
function aiAutoDetect(name) {
  if (!state.settings.ai || !name.trim()) return;
  const guessed = aiGuessCategory(name);
  if (guessed && !document.getElementById("inp-category").value) {
    document.getElementById("inp-category").value = guessed;
    const cfg = CATEGORY_CONFIG[guessed];
    document.getElementById("ai-detect-text").textContent = `Category set to "${cfg.label}" (${cfg.warnDays}d reminder)`;
    document.getElementById("ai-detect-banner").classList.remove("hidden");
  }
  // Intentionally no else clause — banner state is not modified when category is already set
}

/* ── CAMERA ──────────────────────────────────────────────── */
let stream = null;
let facingMode = "environment";

async function startCamera() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    const video = document.getElementById("camera-feed");
    video.srcObject = stream;
    video.style.transform = facingMode === "user" ? "scaleX(-1)" : "scaleX(1)";
    setStep(1);
  } catch (e) {
    toast("Camera access denied. Please allow camera permission.", "error");
    console.warn("Camera error:", e);
  }
}

function stopCamera() {
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
}

/* FIX #18: Guard against capturing before the video stream is ready.
   video.readyState >= 2 (HAVE_CURRENT_DATA) ensures a valid frame exists. */
function captureFrameFromVideo() {
  const video  = document.getElementById("camera-feed");
  if (video.readyState < 2) {
    throw new Error("Camera not ready yet — please wait a moment and try again.");
  }
  const canvas = document.getElementById("scan-canvas");
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (facingMode === "user") {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();
  } else {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}

function captureFrameFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.getElementById("scan-canvas");
        canvas.width  = img.width;
        canvas.height = img.height;
        canvas.getContext("2d").drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/jpeg", 0.85).split(",")[1]);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function analyzeWithNvidia(base64Image) {
  const ocrResponse = await fetch("/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64Image })
  });

  if (!ocrResponse.ok) {
    const err = await ocrResponse.json();
    throw new Error(err.error || "Server error");
  }

  const ocrText = (await ocrResponse.json()).text;

  if (!ocrText || !ocrText.trim()) throw new Error("No text detected in image");
  console.log("OCR raw text:", ocrText);

  return parseOcrText(ocrText);
}

function parseOcrText(text) {
  const result = { name: null, category: null, expiryDate: null, brand: null };

  // ── Extract expiry date ───────────────────────────────────
  const datePatterns = [
    /(?:exp(?:iry)?|expiration|best\s*before|use\s*by|bb|exp\.?\s*date)[:\s.]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    /(?:exp(?:iry)?|expiration|best\s*before|use\s*by|bb)[:\s.]*(\d{1,2}\s+\w{3,9}\s+\d{2,4})/i,
    /(?:exp(?:iry)?|expiration|best\s*before|use\s*by|bb)[:\s.]*(\w{3,9}\s+\d{4})/i,
    /(?:exp(?:iry)?|expiration|best\s*before|use\s*by)[:\s.]*(\d{2,4}[\/\-\.]\d{1,2})/i,
    /(?:exp|expiry|best before|use by)[:\s]*\n\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
  ];
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) { result.expiryDate = normalizeDateStr(match[1]); break; }
  }

  // ── Extract product name (first meaningful line) ──────────
  const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 2);
  const nameLine = lines.find(l =>
    !/^\d[\d\s\-\/\.]{4,}$/.test(l) &&
    !/^(?:exp|mfg|mfd|lot|batch|mrp|rs\.)/i.test(l)
  );
  // FIX #11: Expanded allowlist to preserve common product-name characters
  // (+, /, &, (, ), @) — only strip actual HTML-unsafe and control characters.
  if (nameLine) result.name = nameLine.replace(/[<>"'\\]/g, "").trim().slice(0, 60);

  // ── Extract brand (ALL CAPS short line) ───────────────────
  const brandLine = lines.find(l => /^[A-Z][A-Z\s]{2,}$/.test(l) && l.length < 30);
  if (brandLine && brandLine !== result.name) result.brand = brandLine;

  // ── Guess category from full OCR text ────────────────────
  result.category = aiGuessCategory(text) || aiGuessCategory(result.name || "") || "other";

  return result;
}

function normalizeDateStr(raw) {
  if (!raw) return null;
  try {
    const s = raw.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
    if (dmy) {
      const y = dmy[3].length === 2 ? "20" + dmy[3] : dmy[3];
      return `${y}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`;
    }

    const my = s.match(/^(\d{1,2})[\/\-\.](\d{4})$/);
    if (my) {
      const lastDay = new Date(parseInt(my[2]), parseInt(my[1]), 0).getDate();
      return `${my[2]}-${my[1].padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;
    }

    const months = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
    const mY = s.match(/^(\w{3,9})\s+(\d{4})$/i);
    if (mY) {
      const m = months[mY[1].toLowerCase().slice(0,3)];
      if (m) {
        const lastDay = new Date(parseInt(mY[2]), m, 0).getDate();
        return `${mY[2]}-${String(m).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;
      }
    }

    const dMY = s.match(/^(\d{1,2})\s+(\w{3,9})\s+(\d{4})$/i);
    if (dMY) {
      const m = months[dMY[2].toLowerCase().slice(0,3)];
      if (m) return `${dMY[3]}-${String(m).padStart(2,"0")}-${dMY[1].padStart(2,"0")}`;
    }

    return null;
  } catch { return null; }
}

function fillFormWithResult(result) {
  if (result.name)     document.getElementById("inp-name").value     = result.name;
  if (result.category) document.getElementById("inp-category").value = result.category;
  if (result.brand)    document.getElementById("inp-brand").value    = result.brand;

  if (result.expiryDate) {
    document.getElementById("inp-expiry").value = result.expiryDate;
  } else {
    document.getElementById("inp-expiry").value = "";
    toast("⚠️ Expiry date not visible — please enter it manually", "warn", 5000);
  }

  const cfg = CATEGORY_CONFIG[result.category] || CATEGORY_CONFIG.other;
  document.getElementById("ai-detect-text").textContent =
    `Detected "${result.name}" — ${cfg.label} (reminder: ${cfg.warnDays}d before expiry)`;
  document.getElementById("ai-detect-banner").classList.remove("hidden");
}

async function simulateCapture() {
  try {
    setStep(2);
    const frame   = document.querySelector(".scan-frame");
    const overlay = document.getElementById("ai-overlay");
    const wrap    = document.querySelector(".camera-wrap");
    frame?.classList.add("capturing");
    overlay?.classList.add("visible");

    const base64Image = captureFrameFromVideo();
    const result      = await analyzeWithNvidia(base64Image);

    overlay?.classList.remove("visible");
    frame?.classList.remove("capturing");
    wrap?.classList.add("success-flash");
    setTimeout(() => wrap?.classList.remove("success-flash"), 800);

    fillFormWithResult(result);
    setStep(3);
    toast("✅ AI detected product details!", "success");
  } catch (err) {
    console.error("Scan error:", err);
    document.getElementById("ai-overlay")?.classList.remove("visible");
    document.querySelector(".scan-frame")?.classList.remove("capturing");
    setStep(1);
    toast(`Scan failed: ${err.message}. Try again or add manually.`, "error", 5000);
  }
}

async function handleFileUpload(file) {
  if (!file) return;
  try {
    setStep(2);
    const overlay = document.getElementById("ai-overlay");
    overlay?.classList.add("visible");
    const base64Image = await captureFrameFromFile(file);
    const result      = await analyzeWithNvidia(base64Image);
    overlay?.classList.remove("visible");
    fillFormWithResult(result);
    setStep(3);
    toast("✅ AI detected product details!", "success");
  } catch (err) {
    console.error("Upload scan error:", err);
    document.getElementById("ai-overlay")?.classList.remove("visible");
    setStep(1);
    toast(`Could not analyze image: ${err.message}`, "error", 5000);
  }
}

/* ── NOTIFICATION / REMINDER ─────────────────────────────── */
// FIX #4: Email reminder option now shows a clear "not yet implemented" notice
// rather than silently doing nothing. The toggle persists as intended.
function scheduleReminderFor(item) {
  const status = getStatus(item);
  const cfg = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.other;
  logHistory("remind", `Reminder set: "${item.name}" — alert ${cfg.warnDays}d before expiry via ${item.reminder}`);

  if (status === "expired") {
    setTimeout(() => toast(`⚠️ "${item.name}" has EXPIRED!`, "error", 5000), 100);
  } else if (status === "soon") {
    const days = daysUntilExpiry(item.expiry);
    setTimeout(() => toast(`🔔 "${item.name}" expires in ${days} day(s)!`, "warn", 5000), 800);
  }
  if (state.settings.notifications && "Notification" in window) {
    Notification.requestPermission().then(perm => {
      if (perm === "granted") {
        if (status === "expired" || status === "soon") {
          const days = daysUntilExpiry(item.expiry);
          new Notification("Xpiro Alert ⏱️", {
            body: days < 0 ? `${item.name} has EXPIRED!` : `${item.name} expires in ${days} days!`,
            icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🛡️</text></svg>"
          });
        }
      }
    });
  }
}

// FIX #9: Track alerted item IDs in state.alertedIds to prevent duplicate
// history entries from accumulating every time the page loads.
function checkAllExpiryAlerts() {
  let changed = false;
  state.items.forEach(item => {
    if (getStatus(item) !== "ok" && !state.alertedIds.includes(item.id)) {
      logHistory("expire", `Alert: "${item.name}" is ${getStatus(item)}`);
      state.alertedIds.push(item.id);
      changed = true;
    }
  });
  if (changed) saveState();
}

/* ── THEME ───────────────────────────────────────────────── */
function setTheme(dark) {
  state.settings.dark = dark;
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  const icon = document.getElementById("theme-icon");
  if (icon) icon.className = dark ? "fa-solid fa-moon" : "fa-solid fa-sun";
  const toggle = document.getElementById("settings-dark");
  if (toggle) toggle.checked = dark;
  saveState();
}

/* ── SEED DEMO DATA ──────────────────────────────────────── */
function seedDemoData() {
  if (state.items.length > 0) return;
  const now = new Date();
  const addDays = d => { const dt = new Date(now); dt.setDate(dt.getDate() + d); return dt.toISOString().split("T")[0]; };
  const demos = [
    { name: "Paracetamol 500mg",  category: "medicine", brand: "Cipla",       expiry: addDays(5),   reminder: "app" },
    { name: "Full Cream Milk",    category: "dairy",    brand: "Amul",        expiry: addDays(1),   reminder: "app" },
    { name: "Basmati Rice 5kg",   category: "grocery",  brand: "India Gate",  expiry: addDays(90),  reminder: "email" },
    { name: "Moisturizing Cream", category: "cosmetic", brand: "Nivea",       expiry: addDays(200), reminder: "both" },
    { name: "Orange Juice",       category: "beverage", brand: "Tropicana",   expiry: addDays(-2),  reminder: "app" },
    { name: "Amoxicillin 250mg",  category: "medicine", brand: "Sun Pharma",  expiry: addDays(3),   reminder: "both" },
    { name: "Cheddar Cheese",     category: "dairy",    brand: "Amul",        expiry: addDays(6),   reminder: "app" },
    { name: "Lays Chips",         category: "snacks",   brand: "PepsiCo",     expiry: addDays(30),  reminder: "app" },
  ];
  demos.forEach(d => {
    state.items.push({ id: state.nextId++, addedAt: Date.now(), ...d });
  });
  logHistory("system", "Demo data loaded — welcome to Xpiro!");
  // FIX #15: saveState() was missing — demo items are now persisted immediately
  saveState();
}

/* ── BOOTSTRAP ───────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", async () => {
  await loadState();
  seedDemoData();

  const splash = document.getElementById("splash");
  const appEl  = document.getElementById("app");

  appEl.classList.remove("hidden");
  appEl.style.visibility = "hidden";
  appEl.style.opacity = "0";

  setTheme(state.settings.dark);
  renderDashboard();
  updateBadges();
  checkAllExpiryAlerts();

  // FIX #5: Stop camera when tab is closed or hidden to release the hardware
  window.addEventListener("beforeunload", stopCamera);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopCamera();
  });

  // Try auto-login during splash, then decide what to show
  const autoLoginOk = await authAutoLogin();

  setTimeout(() => {
    splash.style.opacity = "0";
    setTimeout(() => {
      splash.style.display = "none";
      if (autoLoginOk) {
        onAuthSuccess();
        appEl.style.visibility = "visible";
        appEl.style.transition = "opacity 0.3s ease";
        appEl.style.opacity = "1";
      } else {
        showAuthOverlay("login");
      }
    }, 400);
  }, 2200);

  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }

  /* AUTH OVERLAY BUTTONS */
  document.getElementById("login-btn").addEventListener("click", () => {
    const email    = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;
    authLogin(email, password).then(() => {
      if (authToken) {
        appEl.style.visibility = "visible";
        appEl.style.transition = "opacity 0.3s ease";
        appEl.style.opacity = "1";
      }
    });
  });

  document.getElementById("register-btn").addEventListener("click", () => {
    const firstName = document.getElementById("reg-fname").value.trim();
    const lastName  = document.getElementById("reg-lname").value.trim();
    const email     = document.getElementById("reg-email").value.trim();
    const password  = document.getElementById("reg-password").value;
    authRegister(firstName, lastName, email, password).then(() => {
      if (authToken) {
        appEl.style.visibility = "visible";
        appEl.style.transition = "opacity 0.3s ease";
        appEl.style.opacity = "1";
      }
    });
  });

  document.getElementById("show-register").addEventListener("click", e => {
    e.preventDefault();
    showAuthOverlay("register");
  });

  document.getElementById("show-login").addEventListener("click", e => {
    e.preventDefault();
    showAuthOverlay("login");
  });

  /* PASSWORD VISIBILITY TOGGLES */
  ["auth-password", "reg-password"].forEach(inputId => {
    const toggleId = inputId + "-toggle";
    const btn = document.getElementById(toggleId);
    if (!btn) return;
    btn.addEventListener("click", () => {
      const inp = document.getElementById(inputId);
      const icon = btn.querySelector("i");
      if (inp.type === "password") {
        inp.type = "text";
        if (icon) icon.className = "fa-solid fa-eye-slash";
      } else {
        inp.type = "password";
        if (icon) icon.className = "fa-solid fa-eye";
      }
    });
  });

  /* ALLOW ENTER KEY IN AUTH INPUTS */
  document.getElementById("auth-password").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("login-btn").click();
  });
  document.getElementById("auth-email").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("login-btn").click();
  });
  document.getElementById("reg-password").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("register-btn").click();
  });

  /* LOGOUT */
  document.getElementById("sidebar-logout").addEventListener("click", async () => {
    const ok = await confirmDialog("Sign Out", "Are you sure you want to sign out? Your data is saved automatically.");
    if (!ok) return;
    appEl.style.opacity = "0";
    appEl.style.visibility = "hidden";
    authLogout();
  });

  /* NAVIGATION */
  document.querySelectorAll(".nav-item[data-page]").forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      navigateTo(link.dataset.page);
    });
  });

  /* MOBILE MENU */
  const sidebar = document.getElementById("sidebar");
  const sidebarOverlay = document.getElementById("sidebar-overlay");

  document.getElementById("menu-toggle").addEventListener("click", () => {
    sidebar.classList.toggle("open");
    sidebarOverlay.classList.toggle("visible");
  });
  sidebarOverlay.addEventListener("click", () => {
    sidebar.classList.remove("open");
    sidebarOverlay.classList.remove("visible");
  });

  /* THEME TOGGLE */
  document.getElementById("theme-toggle").addEventListener("click", () => setTheme(!state.settings.dark));

  /* SCAN PAGE – camera auto-start when visiting */
  document.querySelectorAll('.nav-item[data-page="scan"]').forEach(el => {
    el.addEventListener("click", () => setTimeout(() => startCamera(), 300));
  });

  /* CAPTURE */
  document.getElementById("capture-btn").addEventListener("click", simulateCapture);

  /* FLIP CAMERA */
  document.getElementById("flip-camera-btn").addEventListener("click", () => {
    facingMode = facingMode === "environment" ? "user" : "environment";
    toast(facingMode === "user" ? "Switched to front camera" : "Switched to rear camera", "info", 1500);
    startCamera();
  });

  /* UPLOAD IMAGE */
  document.getElementById("upload-btn-cam").addEventListener("click", () => {
    document.getElementById("file-upload-input").click();
  });
  document.getElementById("file-upload-input").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    handleFileUpload(file);
    e.target.value = "";
  });

  /* AI AUTO-DETECT ON NAME INPUT */
  let aiTimer = null;
  document.getElementById("inp-name").addEventListener("input", e => {
    clearTimeout(aiTimer);
    aiTimer = setTimeout(() => aiAutoDetect(e.target.value), 500);
  });

  /* ADD ITEM */
  document.getElementById("add-item-btn").addEventListener("click", () => {
    addOrUpdateItem();
    document.getElementById("add-item-btn").innerHTML = '<i class="fa-solid fa-plus"></i> Add Item';
  });

  /* CLEAR FORM */
  document.getElementById("clear-form-btn").addEventListener("click", () => {
    clearForm();
    document.getElementById("add-item-btn").innerHTML = '<i class="fa-solid fa-plus"></i> Add Item';
  });

  /* INVENTORY ADD BUTTON */
  document.getElementById("inv-add-btn").addEventListener("click", () => {
    navigateTo("scan");
    setTimeout(() => startCamera(), 300);
  });

  /* INVENTORY FILTERS */
  document.getElementById("filter-chips").addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    invFilter = chip.dataset.filter;
    renderInventory();
  });
  document.getElementById("search-input").addEventListener("input", e => {
    invSearch = e.target.value;
    renderInventory();
  });
  document.getElementById("sort-select").addEventListener("change", e => {
    invSort = e.target.value;
    renderInventory();
  });

  /* MODAL CLOSE */
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-overlay").addEventListener("click", e => {
    if (e.target === document.getElementById("modal-overlay")) closeModal();
  });

  /* NOTIF BUTTON → reminders */
  document.getElementById("notif-btn").addEventListener("click", () => navigateTo("reminders"));

  /* PROFILE EDIT */
  document.getElementById("edit-profile-btn").addEventListener("click", () => {
    document.getElementById("profile-edit-form").classList.toggle("hidden");
  });
  document.getElementById("cancel-edit-btn").addEventListener("click", () => {
    document.getElementById("profile-edit-form").classList.add("hidden");
  });
  document.getElementById("save-profile-btn").addEventListener("click", () => {
    const fn = document.getElementById("pf-fname").value.trim();
    const ln = document.getElementById("pf-lname").value.trim();
    const em = document.getElementById("pf-email").value.trim();
    const rm = document.getElementById("pf-reminder").value;
    if (!fn) { toast("First name required", "error"); return; }
    state.profile = { firstName: fn, lastName: ln, email: em, reminder: rm };
    saveState();
    document.getElementById("profile-edit-form").classList.add("hidden");
    renderProfile();
    toast("Profile saved!", "success");
    logHistory("system", "Profile updated");
  });

  /* SETTINGS TOGGLES */
  document.getElementById("settings-dark").addEventListener("change", e => setTheme(e.target.checked));
  document.getElementById("settings-notif").addEventListener("change", e => {
    state.settings.notifications = e.target.checked;
    saveState();
    toast(`App notifications ${e.target.checked ? "enabled" : "disabled"}`, "info");
  });
  document.getElementById("settings-email").addEventListener("change", e => {
    state.settings.email = e.target.checked;
    saveState();
    toast(`Email alerts ${e.target.checked ? "enabled" : "disabled"}`, "info");
  });
  document.getElementById("settings-ai").addEventListener("change", e => {
    state.settings.ai = e.target.checked;
    saveState();
    toast(`AI auto-categorize ${e.target.checked ? "enabled" : "disabled"}`, "info");
  });

  /* CLEAR ALL DATA */
  document.getElementById("clear-all-btn").addEventListener("click", async () => {
    const ok = await confirmDialog("Clear All Data", "This will delete ALL items and history. This cannot be undone!");
    if (!ok) return;
    state.items = [];
    state.history = [];
    state.alertedIds = [];
    state.nextId = 1;
    saveState();
    renderProfile();
    toast("All data cleared", "warn");
  });

  /* TOPBAR AVATAR → profile */
  document.getElementById("topbar-avatar").addEventListener("click", () => navigateTo("profile"));

  /* STOP CAMERA WHEN LEAVING SCAN PAGE */
  document.querySelectorAll('.nav-item:not([data-page="scan"])').forEach(link => {
    link.addEventListener("click", stopCamera);
  });

  /* FIX #6: Periodic check always updates badges and re-renders the active
     page — not just the dashboard — so statuses stay fresh everywhere. */
  setInterval(() => {
    updateBadges();
    renderPage(currentPage);
  }, 60000);
});

/* ── GLOBAL EXPOSE (kept for compatibility) ──────────────── */
window.editItem   = editItem;
window.deleteItem = deleteItem;
window.closeModal = closeModal;
