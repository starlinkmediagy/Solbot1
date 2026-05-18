import { CONFIG } from "./config.js";

// Returns { passed: boolean, reasons: string[], data: {...} }
// `reasons` lists why it failed (empty if passed).
export function evaluateToken({ pair, rug }) {
  const reasons = [];

  // ---- Age ----
  const ageMin = pair.pairCreatedAt
    ? (Date.now() - pair.pairCreatedAt) / 60_000
    : null;
  if (ageMin === null) {
    reasons.push("no pair creation time");
  } else {
    if (ageMin < CONFIG.MIN_AGE_MINUTES) reasons.push(`too new (${ageMin.toFixed(1)}m)`);
    if (ageMin > CONFIG.MAX_AGE_MINUTES) reasons.push(`too old (${ageMin.toFixed(1)}m)`);
  }

  // ---- Liquidity ----
  const liq = pair.liquidity?.usd || 0;
  if (liq < CONFIG.MIN_LIQUIDITY_USD) reasons.push(`liq $${liq.toFixed(0)} < $${CONFIG.MIN_LIQUIDITY_USD}`);

  // ---- Market cap (DexScreener calls it fdv for tokens with full circulating supply) ----
  const mc = pair.marketCap || pair.fdv || 0;
  if (mc < CONFIG.MIN_MARKET_CAP_USD) reasons.push(`mc $${mc.toFixed(0)} < $${CONFIG.MIN_MARKET_CAP_USD}`);
  if (mc > CONFIG.MAX_MARKET_CAP_USD) reasons.push(`mc $${mc.toFixed(0)} > $${CONFIG.MAX_MARKET_CAP_USD}`);

  // ---- Volume h1 ----
  const volH1 = pair.volume?.h1 || 0;
  if (volH1 < CONFIG.MIN_VOLUME_H1_USD) reasons.push(`vol1h $${volH1.toFixed(0)} < $${CONFIG.MIN_VOLUME_H1_USD}`);

  // ---- Buy/sell ratio h1 ----
  const buys = pair.txns?.h1?.buys || 0;
  const sells = pair.txns?.h1?.sells || 0;
  const totalTx = buys + sells;
  const buyRatio = totalTx > 0 ? buys / totalTx : 0;
  if (buyRatio < CONFIG.MIN_BUY_RATIO_H1) {
    reasons.push(`buyRatio ${buyRatio.toFixed(2)} < ${CONFIG.MIN_BUY_RATIO_H1}`);
  }

  // ---- RugCheck-based filters ----
  if (!rug) {
    reasons.push("no rugcheck data");
  } else {
    if (CONFIG.REQUIRE_MINT_REVOKED && !rug.mintRevoked) reasons.push("mint not revoked");
    if (CONFIG.REQUIRE_FREEZE_REVOKED && !rug.freezeRevoked) reasons.push("freeze not revoked");
    if (CONFIG.REQUIRE_LP_LOCKED_OR_BURNED && !rug.lpLockedOrBurned) reasons.push("LP not locked/burned");
    if (rug.holders !== null && rug.holders < CONFIG.MIN_HOLDERS) {
      reasons.push(`holders ${rug.holders} < ${CONFIG.MIN_HOLDERS}`);
    }
    if (rug.topHolderPct !== null && rug.topHolderPct > CONFIG.MAX_TOP_HOLDER_PCT) {
      reasons.push(`top holder ${rug.topHolderPct.toFixed(1)}% > ${CONFIG.MAX_TOP_HOLDER_PCT}%`);
    }
    if (rug.top10Pct !== null && rug.top10Pct > CONFIG.MAX_TOP_10_HOLDERS_PCT) {
      reasons.push(`top10 ${rug.top10Pct.toFixed(1)}% > ${CONFIG.MAX_TOP_10_HOLDERS_PCT}%`);
    }
    if (rug.score !== null && rug.score > CONFIG.MAX_RUGCHECK_RISK_SCORE) {
      reasons.push(`rugcheck score ${rug.score} > ${CONFIG.MAX_RUGCHECK_RISK_SCORE}`);
    }
  }

  return {
    passed: reasons.length === 0,
    reasons,
    data: { ageMin, liq, mc, volH1, buyRatio, buys, sells, rug },
  };
}
