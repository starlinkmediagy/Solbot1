import fetch from "node-fetch";

// RugCheck free API. No key required for the summary endpoint.
// Returns safety flags, holder distribution, and a risk score for any Solana mint.

const BASE = "https://api.rugcheck.xyz/v1";

export async function fetchRugCheckReport(mint) {
  const res = await fetch(`${BASE}/tokens/${mint}/report/summary`, {
    headers: { "accept": "application/json" },
  });
  if (!res.ok) {
    // Often 404 if RugCheck hasn't seen the token yet. Return null and let caller decide.
    return null;
  }
  return await res.json();
}

// Helper that turns RugCheck's report into the booleans/numbers we filter on.
// RugCheck's schema isn't perfectly stable, so we defensively check multiple field names.
export function summarizeReport(report) {
  if (!report) return null;

  const risks = report.risks || [];
  const riskNames = new Set(risks.map((r) => (r.name || "").toLowerCase()));

  // RugCheck encodes "good" facts as the *absence* of certain risk entries.
  // E.g., if "Mint Authority still enabled" is NOT in risks, mint is revoked.
  const mintEnabled = riskNames.has("mint authority still enabled");
  const freezeEnabled = riskNames.has("freeze authority still enabled");
  const lpUnlocked =
    riskNames.has("liquidity unlocked") ||
    riskNames.has("low liquidity") === false && riskNames.has("lp unlocked");

  // Top holder %: RugCheck returns "topHolders" array with pct each. Exclude LP & program-owned.
  const topHolders = (report.topHolders || []).filter(
    (h) => !h.insider && !h.address?.endsWith("11111111111111111111111111111111")
  );
  const topHolderPct = topHolders[0]?.pct ?? null;
  const top10Pct = topHolders.slice(0, 10).reduce((s, h) => s + (h.pct || 0), 0);

  return {
    score: report.score ?? report.score_normalised ?? null,
    mintRevoked: !mintEnabled,
    freezeRevoked: !freezeEnabled,
    lpLockedOrBurned: !lpUnlocked,
    holders: report.totalHolders ?? null,
    topHolderPct,
    top10Pct: top10Pct || null,
    risks: risks.map((r) => r.name),
  };
}
