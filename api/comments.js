import { first, onlyGet, relayResult, safeMovieId, safeSliceId, twitcasting } from "./_shared.js";

export default async function handler(req, res) {
  if (!onlyGet(req, res)) return;

  const movieId = safeMovieId(first(req.query.movie_id));
  const sliceId = safeSliceId(first(req.query.slice_id));

  if (!movieId) {
    return res.status(400).json({ error: "invalid_movie_id" });
  }
  if (first(req.query.slice_id) && !sliceId) {
    return res.status(400).json({ error: "invalid_slice_id" });
  }

  const params = new URLSearchParams();
  params.set("limit", "50");
  if (sliceId) params.set("slice_id", sliceId);

  try {
    const result = await twitcasting(
      `/movies/${encodeURIComponent(movieId)}/comments?${params.toString()}`
    );
    return relayResult(res, result, "no-store");
  } catch (error) {
    console.error("comments relay failed:", error?.message || "unknown");
    return res.status(500).json({ error: "relay_error" });
  }
}
