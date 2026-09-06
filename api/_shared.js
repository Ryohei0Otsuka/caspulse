const API_BASE = "https://apiv2.twitcasting.tv";

export function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export function onlyGet(req, res) {
  cors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return false;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return false;
  }
  return true;
}

function credentials() {
  const clientId = process.env.TWITCASTING_CLIENT_ID;
  const clientSecret = process.env.TWITCASTING_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("relay_not_configured");
  }

  return Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
}

export async function twitcasting(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Accept": "application/json",
      "X-Api-Version": "2.0",
      "Authorization": `Basic ${credentials()}`
    },
    redirect: "follow"
  });

  let body;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    body = await response.json().catch(() => ({}));
  } else {
    body = { message: await response.text().catch(() => "") };
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
    rateLimit: {
      limit: response.headers.get("x-ratelimit-limit"),
      remaining: response.headers.get("x-ratelimit-remaining"),
      reset: response.headers.get("x-ratelimit-reset")
    }
  };
}

export function relayResult(res, result, cache = "no-store") {
  res.setHeader("Cache-Control", cache);
  if (result.rateLimit.limit) res.setHeader("X-CASPULSE-RateLimit-Limit", result.rateLimit.limit);
  if (result.rateLimit.remaining) res.setHeader("X-CASPULSE-RateLimit-Remaining", result.rateLimit.remaining);
  if (result.rateLimit.reset) res.setHeader("X-CASPULSE-RateLimit-Reset", result.rateLimit.reset);

  if (!result.ok) {
    return res.status(result.status).json({
      error: "twitcasting_api_error",
      status: result.status,
      details: result.body
    });
  }

  return res.status(200).json(result.body);
}

export function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseTarget(input) {
  if (typeof input !== "string") return null;
  let value = input.trim();
  if (!value) return null;

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      if (host !== "twitcasting.tv") return null;
      value = decodeURIComponent(url.pathname.split("/").filter(Boolean)[0] || "");
    } catch {
      return null;
    }
  }

  value = value.replace(/^@/, "");
  if (!/^[A-Za-z0-9_:@.\-]{1,128}$/.test(value)) return null;
  return value;
}

export function safeId(input) {
  if (typeof input !== "string") return null;
  const value = input.trim();
  return /^[A-Za-z0-9_:@.\-]{1,128}$/.test(value) ? value : null;
}

export function safeMovieId(input) {
  if (typeof input !== "string") return null;
  const value = input.trim();
  return /^[0-9]{1,32}$/.test(value) ? value : null;
}

export function safeSliceId(input) {
  if (input == null || input === "") return null;
  const value = String(input).trim();
  return /^[0-9]{1,32}$/.test(value) ? value : null;
}
