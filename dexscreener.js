import fetch from "node-fetch";

// DexScreener free API. No key needed. Rate limits are generous for our use.
// Docs: https://docs.dexscreener.com/api/reference

const BASE = "https://api.dexscreener.com";

// Fetch all currently boosted/trending Solana pairs.
// This is our main discovery feed since we have no paid RPC for new-mint events.
export async function fetchLatestSolanaPairs() {
  // The "token-profiles/latest/v1" endpoint returns recently-listed tokens across chains.
  // We filter for Solana.
  const res = await fetch(`${BASE}/token-profiles/latest/v1`, {
    headers: { "accept": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`DexScreener profiles HTTP ${res.status}`);
  }
  const data = await res.json();
  // Endpoint returns an array of token profiles. Filter to Solana only.
  if (!Array.isArray(data)) return [];
  return data.filter((t) => t.chainId === "solana" && t.tokenAddress);
}

// Get the full pair data for a given token mint. Returns the most-liquid pair.
export async function fetchTokenPair(mint) {
  const res = await fetch(`${BASE}/latest/dex/tokens/${mint}`, {
    headers: { "accept": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`DexScreener token HTTP ${res.status}`);
  }
  const data = await res.json();
  const pairs = (data?.pairs || []).filter((p) => p.chainId === "solana");
  if (pairs.length === 0) return null;
  // Pick the pair with the highest liquidity.
  pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
  return pairs[0];
}
