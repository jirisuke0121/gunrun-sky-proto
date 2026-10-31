import { recordMap, replayFromRecord, validateGhost } from '../replay-data.js';
// GunRun 試作 — プレイ記録の受け口（Cloudflare Workers + D1）
//   POST /runs            ゲームが1プレイ分のJSONを送る（誰でも）
//   GET  /runs            記録の一覧（要 ADMIN_TOKEN）  ?since=ISO&build=...&limit=200&full=1
//   GET  /runs/<id>       1件の完全な記録（要 ADMIN_TOKEN）
//   GET  /ranking         公開ランキング（誰でも）  ?me=<端末ID> で自分の順位も返す
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
      if (url.pathname === "/ranking" && req.method === "GET") return await ranking(env, cors, url);
      const ghost = url.pathname.match(/^\/ghosts\/([\w-]+)$/);
      if (ghost && req.method === "GET") return await publicGhost(env, cors, url, ghost[1]);
      const m = url.pathname.match(/^\/runs\/([\w-]+)$/);
      if (m && req.method === "GET") return await one(req, env, cors, m[1]);
      if (url.pathname === "/") return json({ ok: true, service: "gunrun-runs", build: "2026-10-31-record-integrity-v1", recordProtocol: 2 }, 200, cors);
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
  if (!a || typeof a !== "object" || !Number.isFinite(a.t) || a.t < 0 || a.t > 300 || typeof a.reason !== "string") return json({ error: "bad_shape" }, 400, cors);
  a.mapKey = recordMap(a);
  if (a.ghost != null) {
    const ghost = validateGhost(a.ghost, recordMap(a), a.t);
    if (!ghost) a.replayError = 'bad_ghost';
    a.ghost = ghost;
  }

  const player = String(a.player || "anon").slice(0, 40);
  const requestedId = typeof a.clientRunId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a.clientRunId) ? a.clientRunId.toLowerCase() : null;
  const receipt = row => {
    const stored = JSON.parse(row.json);
    return json({ok:true,id:row.id,recordProtocol:2,receipt:{clientRunId:stored.clientRunId || null,map:recordMap(stored),difficulty:stored.challenge?.id || 'legacy',rules:stored.challenge?.version || 'unity-v1',t:row.t,score:row.score,reason:row.reason,replay:!!stored.ghost}},200,cors);
  };
  const matching = row => {
    const old = JSON.parse(row.json);
    return row.player === player && old.at === a.at && old.reason === a.reason && old.t === a.t && old.score?.total === a.score?.total && recordMap(old) === recordMap(a) && old.challenge?.id === a.challenge?.id && old.challenge?.version === a.challenge?.version;
  };
  if (requestedId) {
    const existing = await env.DB.prepare('SELECT id,player,t,score,reason,json FROM runs WHERE id = ?').bind(requestedId).first();
    if (existing) return matching(existing) ? receipt(existing) : json({error:'run_id_conflict'},409,cors);
  }
  const now = new Date();
  const since = new Date(now.getTime() - 60_000).toISOString();
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM runs WHERE player = ? AND received_at > ?").bind(player, since).first();
  if (row && row.n >= MAX_PER_MINUTE) return json({ error: "rate_limited" }, 429, cors);

  const id = requestedId || crypto.randomUUID();
  const sc = a.score && typeof a.score === "object" ? a.score.total : null;
  const st = a.stats && typeof a.stats === "object" ? a.stats : {};
  const scr = Array.isArray(a.screen) ? a.screen : [];
  await env.DB.prepare(
    "INSERT INTO runs (id, received_at, played_at, build, player, reason, t, stars, score, kills, gun_kills, input, screen_w, screen_h, json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING"
  ).bind(
    id, now.toISOString(), typeof a.at === "string" ? a.at.slice(0, 40) : null,
    typeof a.build === "string" ? a.build.slice(0, 40) : null, player,
    a.reason.slice(0, 20), a.t, Number.isFinite(a.stars) ? a.stars : null, Number.isFinite(sc) ? sc : null,
    Number.isFinite(st.kills) ? st.kills : null, Number.isFinite(st.gunKills) ? st.gunKills : null,
    typeof a.input === "string" ? a.input.slice(0, 10) : null,
    Number.isFinite(scr[0]) ? Math.round(scr[0]) : null, Number.isFinite(scr[1]) ? Math.round(scr[1]) : null,
    JSON.stringify(a)
  ).run();
  // A successful response is issued only after reading back the stored result.
  const stored = await env.DB.prepare('SELECT id,player,t,score,reason,json FROM runs WHERE id = ?').bind(id).first();
  if (!stored || !matching(stored)) return json({error:'receipt_mismatch'},409,cors);
  return receipt(stored);
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

// ランキング：端末ごとの最高記録。corridor-score-v3以降の6難易度は得点順、旧版・自由調整はクリア優先。
// 対象は本番（map）の記録のみ（ミッションは score が null）。dev版（build が -dev で終わる）と途中終了（quit）は除く。
function rankCte(clear) { return `
WITH s AS (
  SELECT id, player, score, t, played_at, received_at, (reason = 'time') AS cleared,
         COALESCE(json_extract(json, '$.challenge.id'), 'legacy') AS difficulty,
         CASE WHEN reason != 'time' THEN 0 WHEN stars > 0 THEN MIN(3, CAST(stars AS INTEGER)) ELSE
           1 + (score >= COALESCE(json_extract(json, '$.settings.star2'), 430)) + (score >= COALESCE(json_extract(json, '$.settings.star3'), 470)) END AS stars,
         (COALESCE(json_array_length(json, '$.ghost.samples'),0) >= 2 OR COALESCE(json_array_length(json, '$.trail'),0) >= 2) AS replay,
         ${clear ? `CASE json_extract(json, '$.challenge.id') WHEN 'easy' THEN 0 WHEN 'normal' THEN 1 WHEN 'hard' THEN 2 WHEN 'expert' THEN 3 WHEN 'master' THEN 4 WHEN 'ultra' THEN 5 END` : `(CASE WHEN json_extract(json, '$.challenge.version') IN ('corridor-score-v3', 'corridor-cap12-v4', 'corridor-health-v5', 'corridor-crowd6-v6') AND json_extract(json, '$.challenge.id') != 'legacy' THEN 0 WHEN reason = 'time' THEN 1000000 ELSE 0 END) + score`} AS k
  FROM runs
  WHERE reason IN ('time','caught','fell') AND score IS NOT NULL AND (build IS NULL OR build NOT LIKE '%-dev')
    AND COALESCE(json_extract(json, '$.channel'), 'production') != 'dev'
    AND COALESCE(json_extract(json, '$.mapKey'), CASE WHEN json_extract(json, '$.map.id') = 'rock_canyon_v1' OR json_extract(json, '$.mapVersion') = 'rock-canyon-v1'
              THEN 'rock-canyon' ELSE 'old-town' END) = ?
    ${clear ? `AND reason = 'time' AND json_extract(json, '$.challenge.id') IN ('easy','normal','hard','expert','master','ultra') AND json_extract(json, '$.challenge.version') = ?` : `AND COALESCE(json_extract(json, '$.challenge.id'), 'legacy') = ? AND (? = 'legacy' OR json_extract(json, '$.challenge.version') = ?)`}
), b AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY player ORDER BY k DESC, ${clear ? 'score DESC,' : ''} t DESC, received_at DESC, id DESC) AS rn FROM s
), r AS (
  SELECT id, player, replay, cleared, score, difficulty, stars, played_at, received_at, ROUND(t) AS t, RANK() OVER (ORDER BY k DESC) AS pos FROM b WHERE rn = 1
)`; }

const RANK_CTE = rankCte(false), CLEAR_RANK_CTE = rankCte(true);

function rankQuery(mode, map, difficulty, rules) {
  return mode === 'clear' ? { sql: CLEAR_RANK_CTE, args: [map, rules] }
    : { sql: RANK_CTE, args: [map, difficulty, difficulty, rules] };
}

function publicTime(row) {
  const { receivedAt, ...result } = row;
  result.playedAt = null;
  for (const value of [row.playedAt, receivedAt]) {
    if (typeof value === 'string' && value.trim() && Number.isFinite(Date.parse(value))) {
      result.playedAt = new Date(value).toISOString(); break;
    }
  }
  return result;
}

const DIFFICULTIES = ['easy', 'normal', 'hard', 'expert', 'master', 'ultra', 'legacy'];

async function ranking(env, cors, url) {
  const mode = url.searchParams.get('mode') || 'score';
  if (!['score', 'clear'].includes(mode)) return json({ error: 'bad_mode' }, 400, cors);
  const rules = url.searchParams.get('rules') || 'unity-v1';
  if (!['unity-v1', 'corridor-v2', 'corridor-score-v3', 'corridor-cap12-v4', 'corridor-health-v5', 'corridor-crowd6-v6'].includes(rules)) return json({ error: 'bad_rules' }, 400, cors);
  const difficulty = url.searchParams.get('difficulty') || 'legacy';
  if (!DIFFICULTIES.includes(difficulty)) return json({ error: 'bad_difficulty' }, 400, cors);
  const map = url.searchParams.get("map") || "old-town";
  if (!["old-town", "rock-canyon"].includes(map)) return json({ error: "bad_map" }, 400, cors);
  const me = (url.searchParams.get("me") || "").slice(0, 40);
  const query = rankQuery(mode, map, difficulty, rules);
  const top = await env.DB.prepare(query.sql + " SELECT id AS runId, pos, substr(player,1,4) AS tag, cleared, score, difficulty, stars, t, (player = ?) AS me, CASE WHEN replay THEN id ELSE NULL END AS replayId, played_at AS playedAt, received_at AS receivedAt FROM r ORDER BY pos, score DESC, id LIMIT 20").bind(...query.args, me).all();
  const total = await env.DB.prepare(query.sql + " SELECT COUNT(*) AS n FROM r").bind(...query.args).first();
  const mine = me ? await env.DB.prepare(query.sql + " SELECT id AS runId, pos, cleared, score, difficulty, stars, t, played_at AS playedAt, received_at AS receivedAt FROM r WHERE player = ?").bind(...query.args, me).first() : null;
  return json({ map, mode, difficulty: mode === 'clear' ? 'all' : difficulty, rules, total: total ? total.n : 0, me: mine ? publicTime(mine) : null, top: top.results.map(publicTime) }, 200, { ...cors, "cache-control": "no-store" });
}

async function publicGhost(env, cors, url, id) {
  const mode = url.searchParams.get('mode') || 'score';
  if (!['score', 'clear'].includes(mode)) return json({ error: 'bad_mode' }, 400, cors);
  const rules = url.searchParams.get('rules') || 'unity-v1';
  if (!['unity-v1', 'corridor-v2', 'corridor-score-v3', 'corridor-cap12-v4', 'corridor-health-v5', 'corridor-crowd6-v6'].includes(rules)) return json({ error: 'bad_rules' }, 400, cors);
  const difficulty = url.searchParams.get('difficulty') || 'legacy';
  if (!DIFFICULTIES.includes(difficulty)) return json({ error: 'bad_difficulty' }, 400, cors);
  const map = url.searchParams.get("map") || "old-town";
  if (!["old-town", "rock-canyon"].includes(map)) return json({ error: "bad_map" }, 400, cors);
  // Publish only the ranking's selected run and its movement. Full diagnostic
  // records, device IDs and settings remain administrator-only. Recorded-at time is public.
  const query = rankQuery(mode, map, difficulty, rules);
  const ranked = await env.DB.prepare(query.sql + " SELECT id FROM r WHERE id = ? AND replay = 1").bind(...query.args, id).first();
  if (!ranked) return json({ error: "not_found" }, 404, cors);
  const row = await env.DB.prepare("SELECT player, score, json, played_at AS playedAt, received_at AS receivedAt FROM runs WHERE id = ?").bind(id).first();
  if (!row) return json({ error: "not_found" }, 404, cors);
  const ghost = replayFromRecord(JSON.parse(row.json));
  if (!ghost || ghost.map !== map) return json({ error: "unavailable" }, 404, cors);
  return json({ tag: row.player.slice(0, 4), score: row.score, playedAt: publicTime(row).playedAt, ghost }, 200, { ...cors, "cache-control": "public, max-age=60" });
}
