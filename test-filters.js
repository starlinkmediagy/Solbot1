// Quick self-test of the filter logic with synthetic data.
// Run: node --experimental-sqlite test/test-filters.js

import { evaluateToken } from "../src/filters.js";

const now = Date.now();

function syntheticPair(overrides = {}) {
  return {
    pairCreatedAt: now - 10 * 60_000, // 10 min old
    liquidity: { usd: 25_000 },
    marketCap: 80_000,
    fdv: 80_000,
    volume: { h1: 15_000 },
    txns: { h1: { buys: 60, sells: 30 } },
    baseToken: { address: "FakeMint1", symbol: "TEST", name: "Test Coin" },
    dexId: "raydium",
    ...overrides,
  };
}

function syntheticRug(overrides = {}) {
  return {
    score: 1000,
    mintRevoked: true,
    freezeRevoked: true,
    lpLockedOrBurned: true,
    holders: 120,
    topHolderPct: 3.2,
    top10Pct: 18,
    risks: [],
    ...overrides,
  };
}

let pass = 0, fail = 0;
function check(label, expectPassed, result) {
  const ok = result.passed === expectPassed;
  if (ok) {
    console.log(`✅ ${label}`);
    pass++;
  } else {
    console.log(`❌ ${label}`);
    console.log(`   expected passed=${expectPassed}, got passed=${result.passed}`);
    console.log(`   reasons: ${result.reasons.join(", ")}`);
    fail++;
  }
}

// 1. Happy path: everything good → should pass
check("happy path passes", true,
  evaluateToken({ pair: syntheticPair(), rug: syntheticRug() }));

// 2. Too new → fail
check("too new fails", false,
  evaluateToken({
    pair: syntheticPair({ pairCreatedAt: now - 30_000 }),
    rug: syntheticRug(),
  }));

// 3. Too old → fail
check("too old fails", false,
  evaluateToken({
    pair: syntheticPair({ pairCreatedAt: now - 60 * 60_000 }),
    rug: syntheticRug(),
  }));

// 4. Liquidity too low → fail
check("low liq fails", false,
  evaluateToken({
    pair: syntheticPair({ liquidity: { usd: 1000 } }),
    rug: syntheticRug(),
  }));

// 5. Market cap too high → fail
check("mc too high fails", false,
  evaluateToken({
    pair: syntheticPair({ marketCap: 5_000_000, fdv: 5_000_000 }),
    rug: syntheticRug(),
  }));

// 6. Mint not revoked → fail
check("mint not revoked fails", false,
  evaluateToken({ pair: syntheticPair(), rug: syntheticRug({ mintRevoked: false }) }));

// 7. Top holder too high → fail
check("top holder too high fails", false,
  evaluateToken({ pair: syntheticPair(), rug: syntheticRug({ topHolderPct: 12 }) }));

// 8. No rugcheck data → fail
check("missing rug fails", false,
  evaluateToken({ pair: syntheticPair(), rug: null }));

// 9. Low buy ratio → fail
check("low buy ratio fails", false,
  evaluateToken({
    pair: syntheticPair({ txns: { h1: { buys: 10, sells: 50 } } }),
    rug: syntheticRug(),
  }));

// 10. Too few holders → fail
check("too few holders fails", false,
  evaluateToken({ pair: syntheticPair(), rug: syntheticRug({ holders: 20 }) }));

console.log(`\nResult: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
