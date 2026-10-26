// Recorded-at time is shown consistently in Japan time, on every device.
const formatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
export function formatReplayTime(value) {
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) return '日時不明';
  const parts = Object.fromEntries(formatter.formatToParts(new Date(value)).map(p => [p.type, p.value]));
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}
