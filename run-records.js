import { recordMap } from './replay-data.js?v=20261031-record-integrity-v1';

export const RECORD_ENDPOINT = 'https://gunrun-runs.jirisuke0121.workers.dev';
const OUTBOX = 'gunrun-run-outbox-v1', HISTORY = 'gunrun-run-history-v1';
const copy = value => JSON.parse(JSON.stringify(value));
export function resultOnly(a) {
  const keys = ['v','clientRunId','player','at','build','channel','mapVersion','mapKey','map','kind','mission','challenge','reason','t','score','stars','lives','input','screen','_deliveryUncertain'];
  const result = Object.fromEntries(keys.filter(key => key in a).map(key => [key, a[key]]));
  result.ghost = null; result.recordDetail = 'result-only'; return result;
}

// Collection, durable local storage, server acknowledgement and ranking are
// separate states. A closed collector never means a successful upload.
export function createRunRecords({ storage, fetcher = fetch, uuid = () => crypto.randomUUID(), allowed = () => true,
  announce = () => {}, emit = () => {}, endpoint = RECORD_ENDPOINT } = {}) {
  const read = (key, fallback) => { try { return JSON.parse(storage.getItem(key)) || fallback; } catch { return fallback; } };
  const queue = read(OUTBOX, {}); let history = read(HISTORY, []), protocol = 0;
  const flights = new Map();
  let player;
  try { player = storage.getItem('gunrun-pid'); } catch {}
  if (!player) { player = uuid(); try { storage.setItem('gunrun-pid', player); } catch {} }
  const rows = () => history.map(row => ({ ...row }));
  function update(id, change) {
    const row = history.find(row => row.clientRunId === id); if (row) Object.assign(row, change);
    try { storage.setItem(HISTORY, JSON.stringify(history)); } catch {}
    if (row) announce({ ...row }, rows());
  }
  function persist() {
    try { storage.setItem(OUTBOX, JSON.stringify(queue)); return true; }
    catch {
      // Preserve results before optional replay/diagnostic detail on quota errors.
      const compact = Object.fromEntries(Object.entries(queue).map(([id,a]) => [id,resultOnly(a)]));
      try { storage.setItem(OUTBOX, JSON.stringify(compact)); Object.assign(queue,compact); return true; } catch { return false; }
    }
  }
  async function capability() {
    try {
      const response = await fetcher(endpoint + '/', { cache:'no-store' });
      if (response.ok) protocol = Number((await response.json()).recordProtocol) || 1;
    } catch {}
    return protocol;
  }
  function requestOptions(payload) {
    const body = {...payload}; delete body._deliveryUncertain;
    const options = { method:'POST', headers:{'content-type':'text/plain;charset=UTF-8'}, body:JSON.stringify(body) };
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') options.signal = AbortSignal.timeout(15000);
    return options;
  }
  async function verify(a, receiptId) {
    if (a.kind !== 'map' || !['time','caught','fell'].includes(a.reason) || !Number.isFinite(a.score?.total)) return 'excluded';
    const query = new URLSearchParams({ map:recordMap(a), mode:'score', difficulty:a.challenge?.id || 'legacy', rules:a.challenge?.version || 'unity-v1', me:a.player });
    try {
      const response = await fetcher(endpoint + '/ranking?' + query, { cache:'no-store' });
      if (!response.ok) return 'unconfirmed';
      const data = await response.json(), own = data.top?.find(row => row.me);
      if (data.map !== recordMap(a) || data.difficulty !== (a.challenge?.id || 'legacy') || data.rules !== (a.challenge?.version || 'unity-v1')) return 'unconfirmed';
      if (own?.replayId === receiptId || own?.runId === receiptId || data.me?.runId === receiptId) return 'confirmed';
      if (data.me && Number(data.me.score) >= a.score.total) return 'best-only';
    } catch {}
    return 'unconfirmed';
  }
  async function deliver(id) {
    if (flights.has(id)) return flights.get(id);
    if (!queue[id] || !allowed()) return null;
    const flight = (async () => {
      const a = queue[id], previous = history.find(row => row.clientRunId === id);
      if (previous?.receiptId) { delete queue[id]; persist(); return {id:previous.receiptId,clientRunId:id,ranking:previous.ranking}; }
      // The old server does not deduplicate uncertain deliveries. Do not
      // multiply play records by retrying a request whose response was lost.
      if ((previous?.uncertain || a._deliveryUncertain) && protocol < 2) {
        await capability();
        if (protocol < 2) { update(id,{state:'pending',error:'送信結果が不明です。二重登録を防ぐため再送を保留しています'}); return null; }
      }
      update(id,{state:'sending',error:null,uncertain:true});
      a._deliveryUncertain = true; persist();
      let payload = a;
      try {
        let response = await fetcher(endpoint + '/runs', requestOptions(payload));
        let body; try { body = await response.json(); } catch { body = null; }
        if ((response.status === 400 && body?.error === 'bad_ghost') || response.status === 413) {
          // Old deployed servers may reject optional replay detail. Never drop
          // the score with it; an explicit rejection proves no insert occurred.
          payload = resultOnly(a); queue[id] = payload; persist();
          response = await fetcher(endpoint + '/runs', requestOptions(payload));
          try { body = await response.json(); } catch { body = null; }
        }
        if (!response.ok || !body?.ok || !body.id) {
          const error = new Error(`HTTP ${response.status}${body?.error ? ' / ' + body.error : ''}`);
          error.uncertain = response.ok || response.status >= 500; throw error;
        }
        protocol = Math.max(protocol, Number(body.recordProtocol) || 1);
        update(id,{state:'saved',receiptId:body.id,uncertain:false,error:null});
        delete queue[id]; persist();
        emit({id:body.id,clientRunId:id});
        const ranking = await verify(payload, body.id);
        update(id,{ranking,state:'saved'});
        return { id:body.id,clientRunId:id,ranking };
      } catch (error) {
        if (queue[id]) queue[id]._deliveryUncertain = error.uncertain ?? true;
        persist();
        update(id,{state:'pending',error:error.message || '通信エラー',uncertain:error.uncertain ?? true});
        return null;
      }
    })();
    flights.set(id,flight); try { return await flight; } finally { flights.delete(id); }
  }
  async function submit(value) {
    let a;
    try { a = copy(value); } catch { a = copy(resultOnly(value)); }
    a.clientRunId ||= uuid(); a.player = player; a.mapKey = recordMap(a);
    const existing = history.find(row => row.clientRunId === a.clientRunId);
    if (existing?.receiptId) return { id:existing.receiptId,clientRunId:a.clientRunId,ranking:existing.ranking };
    if (!existing) history.unshift({ clientRunId:a.clientRunId,at:a.at,map:a.mapKey,difficulty:a.challenge?.id || 'legacy',reason:a.reason,t:a.t,score:a.score?.total ?? null,state:'local',ranking:null });
    history = history.slice(0,50);
    // Local result history remains available even when sending is disabled.
    if (!allowed()) { update(a.clientRunId,{state:'excluded',error:'記録送信オフ、または練習・検証モードのため送信しません'}); return null; }
    if (JSON.stringify(a).length > 550000) a = resultOnly(a);
    queue[a.clientRunId] = a;
    update(a.clientRunId,{state:'pending',localStored:persist()});
    return deliver(a.clientRunId);
  }
  async function retry() {
    if (!allowed()) return;
    await capability();
    for (const id of Object.keys(queue)) await deliver(id);
  }
  return { submit,retry,capability,newRunId:uuid,get player(){return player;},get history(){return rows();},get pending(){return Object.keys(queue).length;},get protocol(){return protocol;} };
}

export function installRunRecords(game, win = window, doc = document) {
  const panels = [];
  const scope = () => win.skyPracticeMode ? '練習場：ランキング対象外' : win.skyChallenge.debug ? '検証モード：ランキング対象外' : game.U.sendLog ? '記録送信オン' : '記録送信オフ：結果はこの端末だけに保存';
  let current;
  const message = row => {
    if (!row) return scope();
    if (row.state === 'excluded') return '端末に結果を保存。' + scope();
    if (row.state === 'sending') return '端末保存済み・サーバーへ送信中…';
    if (row.state === 'pending') return `${row.localStored === false ? '端末への保存に失敗・画面を閉じないでください。' : '端末保存済み・未送信。'} ${row.error || ''}`;
    if (row.state === 'saved') return row.ranking === 'confirmed' ? 'サーバー保存済み・ランキング確認済み' : row.ranking === 'best-only' ? 'サーバー保存済み・ランキングは自己ベストを表示' : row.ranking === 'excluded' ? 'サーバー保存済み（ランキング対象外のプレイ）' : 'サーバー保存済み・ランキングの反映は未確認';
    return '端末に結果を保存しました';
  };
  let store;
  function render(row) {
    if (row && (!current || row.clientRunId === current.clientRunId || row.clientRunId === store?.history[0]?.clientRunId)) current = row;
    for (const panel of panels) {
      panel.querySelector('[data-record-status]').textContent = message(current);
      panel.querySelector('input').checked = !!game.U.sendLog;
      panel.querySelector('input').disabled = !!win.skyPracticeMode || win.skyChallenge.debug;
      panel.querySelector('button').hidden = !store?.pending;
      panel.querySelector('small').textContent = `${scope()}${store?.pending ? ` ・ 未送信 ${store.pending}件` : ''}`;
      const history = panel.querySelector('ol'); history.replaceChildren();
      for (const entry of (store?.history || []).slice(0,5)) {
        const li = doc.createElement('li');
        li.textContent = `${new Date(entry.at).toLocaleString('ja-JP')} ${entry.difficulty} ${entry.score ?? '—'}点：${message(entry)}`;
        history.append(li);
      }
    }
    const result = doc.getElementById('runRecordStatus'); if (result) result.textContent = message(current);
  }
  const storage = {getItem:key=>{try{return win.localStorage.getItem(key);}catch{return null;}},setItem:(key,value)=>win.localStorage.setItem(key,value)};
  store = createRunRecords({ storage,fetcher:(...args)=>win.fetch(...args),uuid:()=>win.crypto.randomUUID(),
    allowed:()=>!win.skyPracticeMode&&!win.skyChallenge.debug&&!!game.U.sendLog,
    announce:row=>render(row),emit:detail=>doc.dispatchEvent(new CustomEvent('sky-run-uploaded',{detail})) });
  for (const [id,target] of [['recordDeliveryHome',doc.getElementById('recNote')],['recordDeliveryResult',doc.getElementById('unityRecordStatus') || doc.getElementById('oLog')]]) {
    if (!target) continue;
    const panel = doc.createElement('section'); panel.id = id; panel.className = 'record-delivery';
    panel.innerHTML = '<strong>プレイ記録</strong><p data-record-status role="status"></p><label><input type="checkbox">記録を送信してランキングに参加</label><small></small><button type="button" hidden>未送信の記録を再送</button><details><summary>この端末の最近の記録</summary><ol></ol></details>';
    panel.querySelector('input').addEventListener('change',event=>{game.U.sendLog=event.target.checked;game.Ua();game.nl();render();if(game.U.sendLog)store.retry();});
    panel.querySelector('button').addEventListener('click',()=>store.retry()); target.before(panel); panels.push(panel);
  }
  const live = doc.createElement('p'); live.id = 'runRecordStatus'; live.setAttribute('role','status');
  doc.getElementById('unityResultActions')?.before(live);
  const style = doc.createElement('style'); style.textContent = '.record-delivery{padding:12px;margin:12px 0;border:1px solid #8a98a6;border-radius:8px;font-size:13px;line-height:1.5}.record-delivery p{margin:6px 0}.record-delivery small{display:block}.record-delivery button{margin:8px 0;padding:8px}.record-delivery ol{padding-left:20px}.record-delivery input{margin-right:6px}#runRecordStatus{font-size:12px;line-height:1.5}';doc.head.append(style);
  doc.getElementById('t_sendLog')?.addEventListener('change',()=>{render();if(game.U.sendLog)store.retry();});
  win.addEventListener('online',()=>store.retry());
  win.addEventListener('pageshow',()=>{render();store.retry();});
  render(store.history[0]); store.retry();
  return { ...store,submit:store.submit,retry:store.retry,newRunId:store.newRunId,
    status:()=>message(current),get player(){return store.player;},get history(){return store.history;},get pending(){return store.pending;} };
}
