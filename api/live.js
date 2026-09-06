import { first, onlyGet, relayResult, safeId, twitcasting } from "./_shared.js";

export default async function handler(req, res) {
  if (!onlyGet(req, res)) return;

  const userId = safeId(first(req.query.user_id));
  if (!userId) {
    return res.status(400).json({ error: "invalid_user_id" });
  }

  try {
    const result = await twitcasting(`/users/${encodeURIComponent(userId)}/current_live`);
    return relayResult(res, result, "s-maxage=2, stale-while-revalidate=2");
  } catch (error) {
    console.error("live relay failed:", error?.message || "unknown");
    return res.status(500).json({ error: "relay_error" });
  }
}
