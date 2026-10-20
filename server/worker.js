// GunRun 試作 — プレイ記録の受け口（Cloudflare Workers + D1）
//   POST /runs            ゲームが1プレイ分のJSONを送る（誰でも）
//   GET  /runs            記録の一覧（要 ADMIN_TOKEN）  ?since=ISO&build=...&limit=200&full=1
//   GET  /runs/<id>       1件の完全な記録（要 ADMIN_TOKEN）
const MAX_BYTES = 600_000;       // 1プレイの上限（実測は 1.5万〜5万バイト程度）
const MAX_PER_MINUTE = 20;       // 同じ端末IDからの送信上限

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", ...extra } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
    const cors = {
      "Access-Control-Allow-Origin": allowed.length ? (allowed.includes(origin) ? origin : allowed[0]) : "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, authorization",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      if (url.pathname === "/runs" && req.method === "POST") return await receive(req, env, cors, origin, allowed);
      if (url.pathname === "/runs" && req.method === "GET") return await list(req, env, cors, url);
      const m = url.pathname.match(/^\/runs\/([\w-]+)$/);
      if (m && req.method === "GET") return await one(req, env, cors, m[1]);
      if (url.pathname === "/") return json({ ok: true, service: "gunrun-runs" }, 200, cors);
      return json({ error: "not_found" }, 404, cors);
    } catch (e) {
      return json({ error: "server_error" }, 500, cors);
    }
  },
};

async function receive(req, env, cors, origin, allowed) {
  if (allowed.length && origin && !allowed.includes(origin)) return json({ error: "origin" }, 403, cors);
  const text = await req.text();
  if (text.length > MAX_BYTES) return json({ error: "too_large" }, 413, cors);
  let a;
  try { a = JSON.parse(text); } catch { return json({ error: "bad_json" }, 400, cors); }
  if (!a || typeof a !== "object" || typeof a.t !== "number" || typeof a.reason !== "string") return json({ error: "bad_shape" }, 400, cors);

  const player = String(a.player || "anon").slice(0, 40);
  const now = new Date();
  const since = new Date(now.getTime() - 60_000).toISOString();
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM runs WHERE player = ? AND received_at > ?").bind(player, since).first();
  if (row && row.n >= MAX_PER_MINUTE) return json({ error: "rate_limited" }, 429, cors);

  const id = crypto.randomUUID();
  const sc = a.score && typeof a.score === "object" ? a.score.total : null;
  const st = a.stats && typeof a.stats === "object" ? a.stats : {};
  const scr = Array.isArray(a.screen) ? a.screen : [];
  await env.DB.prepare(
    "INSERT INTO runs (id, received_at, played_at, build, player, reason, t, stars, score, kills, gun_kills, input, screen_w, screen_h, json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(
    id, now.toISOString(), typeof a.at === "string" ? a.at.slice(0, 40) : null,
    typeof a.build === "string" ? a.build.slice(0, 40) : null, player,
    a.reason.slice(0, 20), a.t, Number.isFinite(a.stars) ? a.stars : null, Number.isFinite(sc) ? sc : null,
    Number.isFinite(st.kills) ? st.kills : null, Number.isFinite(st.gunKills) ? st.gunKills : null,
    typeof a.input === "string" ? a.input.slice(0, 10) : null,
    Number.isFinite(scr[0]) ? Math.round(scr[0]) : null, Number.isFinite(scr[1]) ? Math.round(scr[1]) : null,
    text
  ).run();
  return json({ ok: true, id }, 200, cors);
}

function isAdmin(req, env) {
  const h = req.headers.get("Authorization") || "";
  return !!env.ADMIN_TOKEN && h === "Bearer " + env.ADMIN_TOKEN;
}

async function list(req, env, cors, url) {
  if (!isAdmin(req, env)) return json({ error: "unauthorized" }, 401, cors);
  const since = url.searchParams.get("since") || "1970-01-01";
  const build = url.searchParams.get("build");
  const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get("limit") || "200", 10) || 200));
  const full = url.searchParams.get("full") === "1";
  const cols = "id, received_at, played_at, build, player, reason, t, stars, score, kills, gun_kills, input, screen_w, screen_h" + (full ? ", json" : "");
  let sql = `SELECT ${cols} FROM runs WHERE received_at >= ?`;
  const args = [since];
  if (build) { sql += " AND build = ?"; args.push(build); }
  sql += " ORDER BY received_at DESC LIMIT ?"; args.push(limit);
  const r = await env.DB.prepare(sql).bind(...args).all();
  return json({ count: r.results.length, runs: r.results }, 200, cors);
}

async function one(req, env, cors, id) {
  if (!isAdmin(req, env)) return json({ error: "unauthorized" }, 401, cors);
  const r = await env.DB.prepare("SELECT json FROM runs WHERE id = ?").bind(id).first();
  if (!r) return json({ error: "not_found" }, 404, cors);
  return new Response(r.json, { status: 200, headers: { "content-type": "application/json; charset=utf-8", ...cors } });
}
