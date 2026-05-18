import { CONFIG } from "./config.js";
import { recordSeen, markAlerted, shouldAlert } from "./db.js";
import { fetchLatestSolanaPairs, fetchTokenPair } from "./dexscreener.js";
import { fetchRugCheckReport, summarizeReport } from "./rugcheck.js";
import { evaluateToken } from "./filters.js";
import { initTelegram, sendAlert, sendStartupPing } from "./telegram.js";

const COOLDOWN_MS = CONFIG.REALERT_COOLDOWN_MINUTES * 60_000;

let scanCount = 0;
let alertCount = 0;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function processCandidate(profile) {
  const mint = profile.tokenAddress;
  recordSeen(mint, null, null);

  if (!shouldAlert(mint, COOLDOWN_MS)) return; // already alerted recently

  // Stage A: get pair + market data
  let pair;
  try {
    pair = await fetchTokenPair(mint);
  } catch (e) {
    console.warn(`[scan] dexscreener fail for ${mint}: ${e.message}`);
    return;
  }
  if (!pair) return;

  // Quick early reject so we don't burn a RugCheck call on garbage
  const liq = pair.liquidity?.usd || 0;
  const mc = pair.marketCap || pair.fdv || 0;
  if (liq < CONFIG.MIN_LIQUIDITY_USD || mc < CONFIG.MIN_MARKET_CAP_USD || mc > CONFIG.MAX_MARKET_CAP_USD) {
    return;
  }

  // Stage B: rugcheck (slower, runs only on survivors)
  let rug = null;
  try {
    const report = await fetchRugCheckReport(mint);
    rug = summarizeReport(report);
  } catch (e) {
    console.warn(`[scan] rugcheck fail for ${mint}: ${e.message}`);
  }

  // Stage C: full evaluation
  const result = evaluateToken({ pair, rug });

  if (!result.passed) {
    // Uncomment for verbose logging while tuning thresholds:
    // console.log(`[skip] ${pair.baseToken?.symbol} — ${result.reasons.join(", ")}`);
    return;
  }

  // Stage D: alert
  console.log(`[ALERT] ${pair.baseToken?.symbol} (${mint}) passed all filters`);
  await sendAlert({ pair, rug, evalData: result.data });
  markAlerted(mint);
  alertCount++;
}

async function scanOnce() {
  scanCount++;
  console.log(`[scan #${scanCount}] fetching latest Solana profiles…`);

  let profiles;
  try {
    profiles = await fetchLatestSolanaPairs();
  } catch (e) {
    console.error("[scan] dexscreener profiles fail:", e.message);
    return;
  }

  console.log(`[scan #${scanCount}] ${profiles.length} solana candidates`);

  // Process serially with a tiny delay to be polite to free APIs.
  for (const p of profiles) {
    try {
      await processCandidate(p);
    } catch (e) {
      console.error(`[scan] candidate error: ${e.message}`);
    }
    await sleep(250);
  }

  console.log(`[scan #${scanCount}] done. total alerts so far: ${alertCount}`);
}

async function main() {
  console.log("=".repeat(50));
  console.log("Solana Sniper Bot starting");
  console.log(`Poll interval: ${CONFIG.POLL_INTERVAL_MS / 1000}s`);
  console.log(`Filters: liq≥$${CONFIG.MIN_LIQUIDITY_USD}, mc $${CONFIG.MIN_MARKET_CAP_USD}-$${CONFIG.MAX_MARKET_CAP_USD}`);
  console.log("=".repeat(50));

  initTelegram();
  await sendStartupPing();

  // Run forever, sleeping between cycles.
  while (true) {
    try {
      await scanOnce();
    } catch (e) {
      console.error("[scan] unexpected error:", e);
    }
    await sleep(CONFIG.POLL_INTERVAL_MS);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down.");
  process.exit(0);
});
process.on("SIGTERM", () => {
  console.log("\nReceived SIGTERM, shutting down.");
  process.exit(0);
});
