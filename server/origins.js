// Which pages may send play records. ALLOWED_ORIGINS (wrangler.toml) is a comma-separated list.
//   exact:     https://jirisuke0121.github.io
//   subdomain: https://*.y8.com   (any subdomain of y8.com; the bare domain needs its own entry)
// Browsers send the Origin of the page that hosts the game, so a portal that embeds the game
// from its own CDN domain must be listed here or its records and ranking are refused.
export function originAllowed(origin, allowed) {
  if (!allowed.length || !origin) return true;
  return allowed.some(entry => entryMatches(entry, origin));
}

function entryMatches(entry, origin) {
  if (entry === origin) return true;
  const star = entry.indexOf('://*.');
  if (star < 0) return false;
  const protocol = entry.slice(0, star + 1), suffix = entry.slice(star + 4); // 'https:' and '.y8.com'
  let url;
  try { url = new URL(origin); } catch { return false; }
  return url.origin === origin && url.protocol === protocol && url.hostname.length > suffix.length && url.hostname.endsWith(suffix);
}

// Value for Access-Control-Allow-Origin: echo a listed origin, otherwise the first entry.
export function corsOrigin(origin, allowed) {
  if (!allowed.length) return '*';
  return origin && originAllowed(origin, allowed) ? origin : allowed[0];
}
