const DAY = 86400000, JST = 9 * 3600000;
function midnight(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  const value = Date.parse(date + 'T00:00:00+09:00');
  return Number.isFinite(value) && new Date(value + JST).toISOString().slice(0, 10) === date ? value : NaN;
}
export function telemetryRange(params, now = Date.now()) {
  const from = params.get('from'), to = params.get('to');
  if (params.has('from') || params.has('to')) {
    if (!from || !to) return null;
    const start = midnight(from), last = midnight(to);
    if (!Number.isFinite(start) || !Number.isFinite(last) || start > last) return null;
    return {kind:'custom', from, to, fromMs:start, toExclusiveMs:last + DAY, timeZone:'Asia/Tokyo', basis:'received'};
  }
  const days = Math.min(30, Math.max(1, Number(params.get('days')) || 7));
  return {kind:'rolling', days, fromMs:now - days * DAY, toExclusiveMs:now + 1, timeZone:'Asia/Tokyo', basis:'received'};
}
