const get = id => document.getElementById(id);
const names = { 'old-town': '旧市街', 'rock-canyon': '渓谷', desktop: 'PC', iphone: 'iPhone', ipad: 'iPad', android: 'Android',
  auto: '自動', performance: '軽量', minimum:'最軽量', balanced: '標準', high: '高精細（従来）', github: 'GitHub Pages', y8: 'Y8', unknown: '不明',
  ios:'iOS / iPadOS',android:'Android',windows:'Windows NT',macos:'macOS',linux:'Linux',safari:'Safari',chrome:'Chrome',firefox:'Firefox',edge:'Edge',samsung:'Samsung Internet',
  javascript: 'JavaScript', resource: 'ファイル読み込み', promise: '非同期処理' };
const label = value => names[value] || value || '—';
const fps = value => value == null ? '—' : Number(value).toFixed(1);
function country(value) { if (!value || value === 'unknown') return '不明'; try { return new Intl.DisplayNames(['ja'],{type:'region'}).of(value) || value; } catch { return value; } }
const filterKeys = ['days','build','map','device','source','difficulty','quality','country','os','browser','cores','memoryGb','model'];
let generation = 0, request;
addEventListener('pagehide', () => { generation++; request?.abort(); get('token').value = ''; clearData(); });
function rows(target, items, values, columns) {
  target.replaceChildren();
  if (!items.length) {
    const td = document.createElement('td'); td.colSpan = columns; td.textContent = '対象の計測はありません。';
    const tr = document.createElement('tr'); tr.append(td); target.append(tr); return;
  }
  for (const item of items) {
    const tr = document.createElement('tr');
    for (const value of values(item)) { const td = document.createElement('td'); td.textContent = String(value); tr.append(td); }
    target.append(tr);
  }
}
function clearData() { for (const id of ['flow','performanceRows','errorRows','countryRows','environmentRows']) get(id)?.replaceChildren(); }
function setOptions(key, values, display = label) {
  const selected=get(key).value, options=[...new Set([selected,...values.map(v=>v==null?'unknown':String(v))].filter(Boolean))];
  get(key).replaceChildren(new Option('すべて',''),...options.sort().map(v=>new Option(display(v),v))); get(key).value=selected;
}
function datesChanged() {
  const custom=get('days').value==='custom'; get('dateRange').hidden=!custom;
  get('from').required=get('to').required=custom;
  get('to').setCustomValidity(custom && get('from').value && get('to').value && get('from').value>get('to').value?'終了日は開始日以降を指定してください。':'');
}
const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
get('to').value=today;get('from').value=new Date(Date.parse(today+'T00:00:00+09:00')-6*86400000+9*3600000).toISOString().slice(0,10);
for (const id of ['days','from','to']) get(id).addEventListener('change',datesChanged);
datesChanged();
get('disconnect').addEventListener('click', () => {
  generation++; request?.abort(); get('token').value = ''; clearData(); get('refresh').disabled = false;
  get('status').textContent = '接続情報を消去しました。';
});
get('ownerForm').addEventListener('submit', async event => {
  event.preventDefault(); const current = ++generation; request?.abort(); request = new AbortController();
  get('refresh').disabled = true; get('status').textContent = '読み込み中…'; clearData();
  try {
    const base = new URL(get('endpoint').value);
    if (!(base.origin === 'https://gunrun-runs.jirisuke0121.workers.dev' ||
      (['localhost', '127.0.0.1'].includes(base.hostname) && ['http:', 'https:'].includes(base.protocol))) || base.username || base.password) throw new Error('接続先は空中回廊の記録サーバー、またはローカル検証サーバーを指定してください。');
    const url = new URL('/admin/overview', base.origin);
    for (const key of filterKeys) if (get(key).value && !(key==='days' && get('days').value==='custom')) url.searchParams.set(key, get(key).value);
    if(get('days').value==='custom') {url.searchParams.set('from',get('from').value);url.searchParams.set('to',get('to').value);}
    const result = await fetch(url, { headers: { Authorization: 'Bearer ' + get('token').value },
      cache: 'no-store', signal: request.signal });
    if (result.status === 401) throw new Error('管理者トークンを確認してください。');
    if (!result.ok) throw new Error(`集計を取得できませんでした（HTTP ${result.status}）。`);
    const data = await result.json(); if (current !== generation) return;
    const selected = get('build').value;
    const options = [...new Set([selected, ...data.builds].filter(Boolean))];
    get('build').replaceChildren(new Option('すべて', ''), ...options.map(v => new Option(v, v)));
    get('build').value = selected;
    for(const key of ['country','os','browser','cores','memoryGb','model']) setOptions(key,(data.environmentOptions||[]).map(r=>r[key]),key==='country'?country:label);
    for (const [key, text] of Object.entries({ boots: '起動', homes: 'ホーム到達', starts: '開始プレイ', finishes: '終了', quits: '途中終了通知', retries: '再挑戦', errors: 'エラー' })) {
      const box = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = text; dd.textContent = data.summary[key] ?? 0; box.append(dt, dd); get('flow').append(box);
    }
    rows(get('performanceRows'), data.performance, r => [r.build, `${label(r.map)} / ${label(r.difficulty)}`,
      `${label(r.source)} / ${label(r.device)}`, `${label(r.quality)} ${r.ratio}倍 / ${r.width}×${r.height} / 影${r.shadows==null?'不明':r.shadows?'あり':'なし'}`,
      r.samples, Number(r.averageFps).toFixed(1), `${(r.below30Ratio * 100).toFixed(1)}%`, r.interrupted], 8);
    rows(get('errorRows'), data.errors, r => [r.build, label(r.map), label(r.device), label(r.error), r.count], 5);
    rows(get('countryRows'),data.countries||[],r=>[country(r.country),r.sessions,r.starts,r.finishes,r.samples,fps(r.averageFps)],6);
    rows(get('environmentRows'),data.environments||[],r=>[`${country(r.country)} / ${label(r.device)}`,
      `${label(r.os)} ${r.osVersion||''} / ${label(r.browser)} ${r.browserVersion||''}`,r.model||'不明',
      `${r.cores==null?'CPU不明':r.cores+'論理コア'} / ${r.memoryGb==null?'RAM不明':'約'+r.memoryGb+'GB'}`,
      `${r.screenWidth&&r.screenHeight?r.screenWidth+'×'+r.screenHeight:'画面不明'} / 端末DPR ${r.nativeRatio??'不明'}`,
      r.sessions,r.samples,fps(r.averageFps)],8);
    const period=data.range?.kind==='custom'?`${data.range.from} 〜 ${data.range.to}（両日含む）`:`直近${data.days}日`;
    get('status').textContent = `${new Date(data.generatedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} 更新。対象：${period}。${data.note}${data.truncated ? ' 一覧の上限に達したため一部のみ表示しています。条件を絞ってください。' : ''}`;
  } catch (error) {
    if (current === generation) get('status').textContent = error.name === 'AbortError' ? '読み込みを中止しました。' : error.message;
  } finally { if (current === generation) get('refresh').disabled = false; }
});
