// All tunable settings live here. Edit numbers, not other files.

export const CONFIG = {
  // ---- Telegram ----
  // These are pulled from environment variables on Fly.io for safety.
  // Locally, you can hardcode them if you want to test, but DON'T COMMIT THE FILE.
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || "",

  // ---- Solana RPC (free public endpoint) ----
  // Free public RPC. Will rate-limit under heavy load. Upgrade to Helius free tier
  // (https://helius.dev) when you want better reliability — just paste the URL here.
  RPC_HTTP: process.env.RPC_HTTP || "https://api.mainnet-beta.solana.com",
  RPC_WS: process.env.RPC_WS || "wss://api.mainnet-beta.solana.com",

  // ---- Scanning ----
  // How often to poll DexScreener for fresh Solana pairs (ms).
  // 30s is gentle on their free API. Lower = more chances to catch early, higher = safer.
  POLL_INTERVAL_MS: 30_000,

  // Only look at tokens that have been live for between MIN and MAX minutes.
  // Too new = chaos and rugs. Too old = already pumped.
  MIN_AGE_MINUTES: 2,
  MAX_AGE_MINUTES: 30,

  // ---- Filters (balanced preset) ----
  MIN_LIQUIDITY_USD: 5_000,
  MIN_MARKET_CAP_USD: 15_000,
  MAX_MARKET_CAP_USD: 300_000,

  // Volume in the last hour must be at least this much (USD).
  MIN_VOLUME_H1_USD: 3_000,

  // Buy/sell transaction ratio in last hour: buys must be at least this fraction.
  // 0.55 means more buys than sells.
  MIN_BUY_RATIO_H1: 0.55,

  // Holder distribution checks (from RugCheck).
  MIN_HOLDERS: 50,
  MAX_TOP_HOLDER_PCT: 5,        // single biggest non-LP holder
  MAX_TOP_10_HOLDERS_PCT: 25,   // top 10 combined, excluding LP/bonding-curve

  // Safety (from RugCheck).
  REQUIRE_MINT_REVOKED: true,
  REQUIRE_FREEZE_REVOKED: true,
  REQUIRE_LP_LOCKED_OR_BURNED: true,
  MAX_RUGCHECK_RISK_SCORE: 5_000, // RugCheck scores risk 0-10k. Lower = safer.

  // ---- Notification ----
  // Don't re-alert the same token within this window.
  REALERT_COOLDOWN_MINUTES: 60 * 24,

  // ---- Storage ----
  DB_PATH: process.env.DB_PATH || "/data/sniper.db",
};
