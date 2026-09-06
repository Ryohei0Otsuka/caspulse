import { first, onlyGet, parseTarget, relayResult, twitcasting } from "./_shared.js";

export default async function handler(req, res) {
  if (!onlyGet(req, res)) return;

  const target = parseTarget(first(req.query.target));
  if (!target) {
    return res.status(400).json({ error: "invalid_target" });
  }

  try {
    const result = await twitcasting(`/users/${encodeURIComponent(target)}`);
    return relayResult(res, result, "s-maxage=30, stale-while-revalidate=60");
  } catch (error) {
    console.error("user relay failed:", error?.message || "unknown");
    return res.status(500).json({ error: "relay_error" });
  }
}
