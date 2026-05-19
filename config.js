// Static configuration. Filter thresholds live in settings.js (editable from Telegram).
// This file is only for credentials and infrastructure paths.

export const CONFIG = {
  // ---- Telegram ----
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || "",

  // ---- Solana RPC (free public endpoint by default) ----
  RPC_HTTP: process.env.RPC_HTTP || "https://api.mainnet-beta.solana.com",
  RPC_WS: process.env.RPC_WS || "wss://api.mainnet-beta.solana.com",

  // ---- Storage ----
  DB_PATH: process.env.DB_PATH || "/data/sniper.db",

  // ---- Re-alert cooldown ----
  // Don't re-alert the same token within 24h. Not user-editable since it's a sanity guard.
  REALERT_COOLDOWN_MINUTES: 60 * 24,
};

