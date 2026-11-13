// Y8 tokens never enter run JSON or browser storage. Only hashed, expiring
// opaque game sessions are stored; the identity comes from Y8, not the client.
export const Y8_APP_ID = '6af70306dbd7b9b69d28ee0c';
export async function digest(value) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
export async function signInY8(req, env, cors, fetchProfile = fetch) {
  const headers = {...cors, 'cache-control':'no-store'};
  const reply = (body, status = 200) => Response.json(body, {status, headers});
  const access = (req.headers.get('authorization') || '').match(/^Bearer ([^\s]{1,16384})$/)?.[1];
  if (!access) return reply({error:'invalid_token'}, 401);
  let profile;
  try {
    const response = await fetchProfile('https://account.y8.com/api/profile', {
      headers:{authorization:`Bearer ${access}`, accept:'application/json'}, signal:AbortSignal.timeout(5000), redirect:'manual',
    });
    if ([401,403].includes(response.status)) return reply({error:'invalid_token'}, 401);
    if (!response.ok) { console.warn('y8_profile_http', response.status); return reply({error:'y8_unavailable'}, 503); }
    const raw = await response.text();
    if (raw.length > 16384) return reply({error:'y8_unavailable'}, 503);
    profile = JSON.parse(raw);
  } catch (error) { console.warn('y8_profile_error', error?.name); return reply({error:'y8_unavailable'}, 503); }
  if (profile?.client_id !== Y8_APP_ID) return reply({error:'wrong_app'}, 401);
  if (typeof profile.pid !== 'string' || !profile.pid || profile.pid.length > 256) return reply({error:'invalid_profile'}, 503);
  const player = 'y8_' + (await digest(Y8_APP_ID + ':' + profile.pid)).slice(0,32);
  const name = typeof profile.nickname === 'string' ? profile.nickname.trim().slice(0,80) : 'Y8 Player';
  const token = crypto.randomUUID() + crypto.randomUUID();
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM y8_sessions WHERE expires_at < ?').bind(Date.now()),
    env.DB.prepare('INSERT INTO y8_sessions (token_hash, player, name, expires_at) VALUES (?,?,?,?)').bind(await digest(token), player, name, expiresAt),
  ]);
  return reply({ok:true, player, name, session:{token, expiresAt}});
}
export async function y8Session(req, env) {
  const token = (req.headers.get('authorization') || '').match(/^Bearer ([0-9a-f-]{72})$/i)?.[1];
  if (!token) return null;
  return env.DB.prepare('SELECT player,name FROM y8_sessions WHERE token_hash = ? AND expires_at > ?')
    .bind(await digest(token), Date.now()).first();
}
