// Run: node test/test-telegram-format.js
// Verifies the telegram notifier doesn't crash on synthetic data,
// and shows what the alert will look like.

import { sendAlert } from "../src/telegram.js";

const now = Date.now();
const pair = {
  pairCreatedAt: now - 10 * 60_000,
  liquidity: { usd: 25_000 },
  marketCap: 80_000,
  volume: { h1: 15_000 },
  txns: { h1: { buys: 60, sells: 30 } },
  baseToken: {
    address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    symbol: "TEST",
    name: "Tëst Cöin (3.14)!",  // intentionally has chars MarkdownV2 hates
  },
  dexId: "raydium",
};

const rug = {
  score: 800,
  mintRevoked: true,
  freezeRevoked: true,
  lpLockedOrBurned: true,
  holders: 142,
  topHolderPct: 3.2,
  top10Pct: 18.4,
};

const evalData = {
  ageMin: 10.3,
  liq: 25_000,
  mc: 80_000,
  volH1: 15_000,
  buyRatio: 0.667,
  buys: 60,
  sells: 30,
  rug,
};

console.log("Sending synthetic alert (console fallback mode):\n");
await sendAlert({ pair, rug, evalData });
console.log("\n✅ telegram formatter did not crash");
