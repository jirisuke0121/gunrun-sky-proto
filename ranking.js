import { formatReplayTime } from './replay-time.js?v=20261026-gear-polish-v1';

// One score competition across Easy/Normal/Hard. Free adjustment stays separate.
export function installRanking(game) {
  if(window.skyOwnerReplay)return;
  const $ = id => document.getElementById(id), policy = window.skyChallenge;
  const map = window.SKY_CANYON_MAP ? 'rock-canyon' : 'old-town';
  const esc = value => String(value).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const name = id => policy.levels.find(p => p.id === id)?.name || id;
  const player = () => { try { return window.skyRunRecording?.player || localStorage.getItem('gunrun-pid') || ''; } catch { return ''; } };
  const boxes = [];
  function create(id, limit) {
    const box = document.createElement('section'); box.className = 'rankbox'; box.id = id;
    box.innerHTML = `<h3>スコアランキング <small>${map === 'old-town' ? '旧市街' : '岩壁渓谷'}</small></h3><label class="rank-filter">ランキングの区分 <select aria-label="ランキングの区分"><option value="all">全難易度共通</option><option value="legacy">自由調整</option></select></label><p class="rank-note"></p><div class="rank-body" aria-live="polite"></div>`;
    const state = { box, limit, mode: 'score', difficulty: policy.rankingDifficulty(policy.id), token: 0, data: null };
    box.querySelector('select').value = state.difficulty;
    box.addEventListener('click', event => {
      if (event.target.closest('[data-refresh]')) refresh(state);
      const ghost = event.target.closest('[data-replay]');
      if (ghost) window.skyReplay.open(ghost.dataset.replay, ghost, { mode: state.mode, difficulty: ghost.dataset.difficulty });
    });
    box.querySelector('select').addEventListener('change', event => { state.difficulty = event.target.value; refresh(state); });
    boxes.push(state); return state;
  }
  function controls(state) {
    state.box.querySelector('.rank-note').textContent = state.difficulty === 'legacy'
      ? '自由調整の記録。クリア優先、同じ場合は得点順。通常ランキングとは分けて表示します。'
      : '全難易度の最高スコア順（難易度の倍率を反映）。';
  }
  const clearOf = row => `<span class="rank-clear">${esc(name(row.difficulty))} · ${row.cleared ? 'クリア' : `${row.t}秒`}</span>`;
  const scoreOf = row => `<b class="rank-score">${row.score.toLocaleString('ja-JP')}点</b>`;
  const record = row => clearOf(row) + scoreOf(row);
  // "2026/11/04 21:30" -> "11/04 21:30" (the column header says it is Japan time)
  const shortTime = value => { const t = formatReplayTime(value); return t === '日時不明' ? '—' : t.replace(/^\d{4}\//, ''); };
  function render(state, data) {
    const body = state.box.querySelector('.rank-body'); state.data = data;
    const rows = data.top.slice(0, state.limit);
    const list = rows.map(row => `<li class="${row.me ? 'me' : ''}"><b class="rank-pos">${row.pos}位</b><span class="rank-name">${row.me ? 'あなた' : esc(row.name || row.tag)}</span><span class="rank-meta">${clearOf(row)}<time class="rank-time"${row.playedAt ? ` datetime="${esc(row.playedAt)}"` : ''}>${esc(shortTime(row.playedAt))}</time></span>${scoreOf(row)}${row.replayId ? `<button type="button" class="ghost-button" data-replay="${esc(row.replayId)}" data-difficulty="${esc(row.difficulty)}">ゴーストを見る</button>` : '<small class="rank-time rank-noghost" title="ゴースト記録なし" aria-label="ゴースト記録なし">—</small>'}</li>`).join('');
    const mine = data.me && !rows.some(row => row.me) ? `<div class="rank-mine">あなた：${data.me.pos}位 / ${data.total}人　${record(data.me)}</div>` : '';
    body.innerHTML = `<div class="rank-columns"><span>順位 / プレイヤー</span><span>難易度 · 日時（日本時間）· スコア</span></div>${list ? `<ol>${list}</ol>` : '<p class="rank-empty">スコア記録はまだありません。最初の記録を目指そう。</p>'}${mine}<small class="rank-scope">記録送信がオンのプレイが対象です。</small>`;
  }
  async function refresh(state) {
    const token = ++state.token; controls(state);
    state.box.hidden = !!policy.isIntro; if(policy.isIntro)return null;
    const body = state.box.querySelector('.rank-body'); body.textContent = '記録を読み込み中…';
    const query = new URLSearchParams({ map, mode: state.mode, difficulty: state.difficulty, rules: policy.version });
    const me = player(); if (me) query.set('me', me);
    try {
      const response = await fetch('https://gunrun-runs.jirisuke0121.workers.dev/ranking?' + query, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw Error('ranking');
      const data = await response.json();
      if (token !== state.token) return null;
      if (data.map !== map || (data.mode || 'score') !== state.mode || (state.mode === 'clear' || state.difficulty !== 'legacy') && data.rules !== policy.version || state.mode === 'score' && data.difficulty !== state.difficulty) throw Error('scope');
      render(state, data); return data;
    } catch {
      if (token === state.token) body.innerHTML = '<p>ランキングを読み込めませんでした。</p><button type="button" data-refresh>再読み込み</button>';
      return null;
    }
  }
  const title = create('titleRanking', 10), over = create('resultRanking', 5);
  $('ovStart').querySelector('.map-select').before(title.box);
  $('oStats').before(over.box);
  const reset = state => { state.difficulty = policy.rankingDifficulty(policy.id); state.box.querySelector('select').value = state.difficulty; return refresh(state); };
  new MutationObserver(() => { if (!$('ovStart').hidden) reset(title); }).observe($('ovStart'), { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('sky-difficulty-change', () => { reset(title); ++over.token; });
  document.addEventListener('sky-run-uploaded', () => {
    // Refresh on acknowledgement, including uploads beyond initial polling.
    if (!$('ovOver').hidden && !game.z.mission && game.z.final) refresh(over);
    if (!$('ovStart').hidden) refresh(title);
  });
  let resultToken = 0, presentedRun;
  new MutationObserver(async () => {
    if ($('ovOver').hidden) { ++resultToken; ++over.token; return; }
    if (game.z.mission || policy.isIntroRun || !game.z.final) return;
    if (window.skyChallengeScore.enabled()) $('unityScoreRanking').append(over.box);
    else $('oStats').before(over.box);
    const token = ++resultToken;
    // Show immediately, then refresh after the existing run upload can complete.
    if (presentedRun !== game.z.final) { presentedRun = game.z.final; await reset(over); }
    else await refresh(over);
    for (const delay of [1200, 2000, 3500]) {
      await new Promise(resolve => setTimeout(resolve, delay));
      if (token !== resultToken || $('ovOver').hidden) return;
      await refresh(over);
    }
  }).observe($('ovOver'), { attributes: true, attributeFilter: ['hidden'] });
  window.skyRanking = { refreshTitle: () => reset(title) };
  reset(title);
}
