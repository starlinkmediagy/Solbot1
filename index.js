import { CONFIG } from "./config.js";
import { recordSeen, markAlerted, shouldAlert } from "./db.js";
import { fetchLatestSolanaPairs, fetchTokenPair } from "./dexscreener.js";
import { fetchRugCheckReport, summarizeReport } from "./rugcheck.js";
import { evaluateToken } from "./filters.js";
import { initTelegramMenu, sendAlert, sendStartupPing } from "./telegram.js";
import * as settings from "./settings.js";

const COOLDOWN_MS = CONFIG.REALERT_COOLDOWN_MINUTES * 60_000;

let scanCount = 0;
let alertCount = 0;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function processCandidate(profile) {
  const mint = profile.tokenAddress;
  recordSeen(mint, null, null);

  if (!shouldAlert(mint, COOLDOWN_MS)) return;

  let pair;
  try {
    pair = await fetchTokenPair(mint);
  } catch (e) {
    console.warn(`[scan] dexscreener fail for ${mint}: ${e.message}`);
    return;
  }
  if (!pair) return;

  // Cheap pre-filter so we don't waste a RugCheck call on garbage.
  // Reads from settings DB so live changes apply immediately.
  const s = settings.getAll();
  const liq = pair.liquidity?.usd || 0;
  const mc = pair.marketCap || pair.fdv || 0;
  if (liq < s.MIN_LIQUIDITY_USD || mc < s.MIN_MARKET_CAP_USD || mc > s.MAX_MARKET_CAP_USD) {
    return;
  }

  let rug = null;
  try {
    const report = await fetchRugCheckReport(mint);
    rug = summarizeReport(report);
  } catch (e) {
    console.warn(`[scan] rugcheck fail for ${mint}: ${e.message}`);
  }

  const result = evaluateToken({ pair, rug });
  if (!result.passed) return;

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
  console.log("Solana Sniper Bot v2 starting (interactive menu)");
  console.log("=".repeat(50));

  initTelegramMenu();
  await sendStartupPing();

  while (true) {
    // Read settings each iteration so pause/resume and poll changes apply live
    const paused = settings.getBool("SCAN_PAUSED");
    const pollMs = settings.getNum("POLL_INTERVAL_MS");

    if (paused) {
      // Cheap idle wait while paused
      await sleep(5_000);
      continue;
    }

    try {
      await scanOnce();
    } catch (e) {
      console.error("[scan] unexpected error:", e);
    }
    await sleep(pollMs);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});

process.on("SIGINT", () => { console.log("\nShutting down."); process.exit(0); });
process.on("SIGTERM", () => { console.log("\nReceived SIGTERM, shutting down."); process.exit(0); });
