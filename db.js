import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { CONFIG } from "./config.js";

// Make sure the directory exists (Fly volume mount might be empty on first boot)
try {
  mkdirSync(dirname(CONFIG.DB_PATH), { recursive: true });
} catch (_) {}

// node:sqlite is built into Node 22+, no native compilation needed.
const db = new DatabaseSync(CONFIG.DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS seen_tokens (
    mint TEXT PRIMARY KEY,
    first_seen_at INTEGER NOT NULL,
    last_alerted_at INTEGER,
    symbol TEXT,
    name TEXT,
    notes TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_seen_tokens_alerted ON seen_tokens(last_alerted_at);
`);

const stmts = {
  upsertSeen: db.prepare(`
    INSERT INTO seen_tokens (mint, first_seen_at, symbol, name)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(mint) DO NOTHING
  `),
  markAlerted: db.prepare(`
    UPDATE seen_tokens SET last_alerted_at = ? WHERE mint = ?
  `),
  getToken: db.prepare(`SELECT * FROM seen_tokens WHERE mint = ?`),
};

export function recordSeen(mint, symbol, name) {
  stmts.upsertSeen.run(mint, Date.now(), symbol || null, name || null);
}

export function markAlerted(mint) {
  stmts.markAlerted.run(Date.now(), mint);
}

export function getToken(mint) {
  return stmts.getToken.get(mint);
}

export function shouldAlert(mint, cooldownMs) {
  const row = stmts.getToken.get(mint);
  if (!row || !row.last_alerted_at) return true;
  return Date.now() - row.last_alerted_at > cooldownMs;
}
