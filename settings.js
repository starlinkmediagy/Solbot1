// Persistent settings stored in SQLite. Edits via Telegram menu, no redeploy needed.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { CONFIG } from "./config.js";

// Re-use the same DB file as the main app
try { mkdirSync(dirname(CONFIG.DB_PATH), { recursive: true }); } catch (_) {}

const db = new DatabaseSync(CONFIG.DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS alert_history (
    mint TEXT NOT NULL,
    symbol TEXT,
    mc REAL,
    liq REAL,
    alerted_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_alert_history_time ON alert_history(alerted_at);
`);

// Default values for every editable setting. Used on first run.
const DEFAULTS = {
  MIN_LIQUIDITY_USD: 5_000,
  MIN_MARKET_CAP_USD: 15_000,
  MAX_MARKET_CAP_USD: 300_000,
  MIN_VOLUME_H1_USD: 3_000,
  MIN_BUY_RATIO_H1: 0.55,
  MIN_HOLDERS: 50,
  MAX_TOP_HOLDER_PCT: 5,
  MAX_TOP_10_HOLDERS_PCT: 25,
  MIN_AGE_MINUTES: 2,
  MAX_AGE_MINUTES: 30,
  MAX_RUGCHECK_RISK_SCORE: 5_000,
  REQUIRE_MINT_REVOKED: 1,         // 0 or 1
  REQUIRE_FREEZE_REVOKED: 1,
  REQUIRE_LP_LOCKED_OR_BURNED: 1,
  POLL_INTERVAL_MS: 30_000,
  SCAN_PAUSED: 0,                   // 0 = running, 1 = paused
};

const stmts = {
  get: db.prepare(`SELECT value FROM settings WHERE key = ?`),
  set: db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`),
  recordAlert: db.prepare(`INSERT INTO alert_history (mint, symbol, mc, liq, alerted_at) VALUES (?, ?, ?, ?, ?)`),
  alertsSince: db.prepare(`SELECT mint, symbol, mc, liq, alerted_at FROM alert_history WHERE alerted_at > ? ORDER BY alerted_at DESC`),
  alertCountSince: db.prepare(`SELECT COUNT(*) as c FROM alert_history WHERE alerted_at > ?`),
};

// Seed defaults if not present
for (const [k, v] of Object.entries(DEFAULTS)) {
  if (!stmts.get.get(k)) {
    stmts.set.run(k, String(v));
  }
}

// Read a setting as a number (handles both int and float)
export function getNum(key) {
  const row = stmts.get.get(key);
  if (!row) return DEFAULTS[key] ?? null;
  return Number(row.value);
}

// Read a setting as a boolean (stored as 0/1)
export function getBool(key) {
  return getNum(key) === 1;
}

// Write a number setting
export function setNum(key, value) {
  stmts.set.run(key, String(value));
}

// Write a boolean (stored as 0/1)
export function setBool(key, value) {
  stmts.set.run(key, value ? "1" : "0");
}

// Get all settings as a {key: value} object
export function getAll() {
  const out = {};
  for (const k of Object.keys(DEFAULTS)) {
    out[k] = getNum(k);
  }
  return out;
}

// Reset every setting to its default value
export function resetAll() {
  for (const [k, v] of Object.entries(DEFAULTS)) {
    stmts.set.run(k, String(v));
  }
}

// Record an alert in history (used for /stats)
export function recordAlertHistory(mint, symbol, mc, liq) {
  stmts.recordAlert.run(mint, symbol || null, mc || null, liq || null, Date.now());
}

// Count alerts since timestamp
export function alertCountSince(ts) {
  return stmts.alertCountSince.get(ts).c;
}

// List alerts since timestamp
export function alertsSince(ts) {
  return stmts.alertsSince.all(ts);
}

export { DEFAULTS };
