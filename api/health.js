import { onlyGet } from "./_shared.js";

export default async function handler(req, res) {
  if (!onlyGet(req, res)) return;

  const configured = Boolean(
    process.env.TWITCASTING_CLIENT_ID &&
    process.env.TWITCASTING_CLIENT_SECRET
  );

  res.setHeader("Cache-Control", "no-store");
  return res.status(configured ? 200 : 503).json({
    ok: configured,
    service: "caspulse-relay",
    version: "0.1.0"
  });
}
