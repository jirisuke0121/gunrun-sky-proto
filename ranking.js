import { formatReplayTime } from './replay-time.js?v=20261026-gear-polish-v1';

// Unity keeps highest cleared difficulty and highest score as separate records.
export function installRanking(game) {
  const $ = id => document.getElementById(id), policy = window.skyChallenge;
  const map = window.SKY_CANYON_MAP ? 'rock-canyon' : 'old-town';
  const esc = value => String(value).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const name = id => policy.levels.find(p => p.id === id)?.name || id;
  const player = () => { try { return window.skyRunRecording?.player || localStorage.getItem('gunrun-pid') || ''; } catch { return ''; } };
  const boxes = [];
  function create(id, limit) {
    const box = document.createElement('section'); box.className = 'rankbox'; box.id = id;
    box.innerHTML = `<h3>ランキング <small>${map === 'old-town' ? '旧市街' : '岩壁渓谷'}</small></h3><div class="rank-tabs" role="group" aria-label="ランキングの種類"><button type="button" data-mode="clear" aria-pressed="true">難易度クリア</button><button type="button" data-mode="score" aria-pressed="false">スコア</button></div><label class="rank-filter" hidden>スコアの区分 <select aria-label="スコアの区分">${policy.levels.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select></label><p class="rank-note"></p><div class="rank-body" aria-live="polite"></div>`;
    const state = { box, limit, mode: policy.id === 'legacy' ? 'score' : 'clear', difficulty: policy.id, token: 0, data: null };
    box.querySelector('select').value = state.difficulty;
    box.addEventListener('click', event => {
      const tab = event.target.closest('button[data-mode]');
      if (tab) { state.mode = tab.dataset.mode; refresh(state); }
      if (event.target.closest('[data-refresh]')) refresh(state);
      const ghost = event.target.closest('[data-replay]');
      if (ghost) window.skyReplay.open(ghost.dataset.replay, ghost, { mode: state.mode, difficulty: ghost.dataset.difficulty });
    });
    box.querySelector('select').addEventListener('change', event => { state.difficulty = event.target.value; refresh(state); });
    boxes.push(state); return state;
  }
  function controls(state) {
    for (const button of state.box.querySelectorAll('[data-mode]')) button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode));
    state.box.querySelector('.rank-filter').hidden = state.mode !== 'score';
    state.box.querySelector('.rank-note').textContent = state.mode === 'clear'
      ? '2分逃げ切った最高難易度で比較。同じ難易度は同順位です。'
      : state.difficulty === 'legacy' ? '自由調整の記録。クリア優先、同じ場合は得点順。'
      : `${name(state.difficulty)}の最高得点で比較。クリア・星は得点とは別に表示。`;
  }
  function record(row) {
    const stars = Math.min(3, Math.max(0, Number(row.stars) || 0));
    return `<span class="rank-clear">${row.cleared ? `${esc(name(row.difficulty))} クリア` : `未クリア · ${row.t}秒`}</span><b class="rank-score">${row.score.toLocaleString('ja-JP')}点</b><span class="rank-stars" aria-label="星${stars}個、3個中">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`;
  }
  function render(state, data) {
    const body = state.box.querySelector('.rank-body'); state.data = data;
    const rows = data.top.slice(0, state.limit);
    const list = rows.map(row => `<li class="${row.me ? 'me' : ''}"><b>${row.pos}位</b><span>${row.me ? 'あなた' : esc(row.tag)}</span>${record(row)}<time class="rank-time"${row.playedAt ? ` datetime="${esc(row.playedAt)}"` : ''}>${esc(formatReplayTime(row.playedAt))}${row.playedAt ? '（日本時間）' : ''}</time>${row.replayId ? `<button type="button" class="ghost-button" data-replay="${esc(row.replayId)}" data-difficulty="${esc(row.difficulty)}">ゴーストを見る</button>` : '<small class="rank-time">ゴースト記録なし</small>'}</li>`).join('');
    const mine = data.me && !rows.some(row => row.me) ? `<div class="rank-mine">あなた：${data.me.pos}位 / ${data.total}人　${record(data.me)}</div>` : '';
    body.innerHTML = `<div class="rank-columns"><span>順位 / プレイヤー</span><span>難易度クリア / スコア / 星</span></div>${list ? `<ol>${list}</ol>` : `<p class="rank-empty">${state.mode === 'clear' ? 'まだ2分逃げ切った記録がありません。最初のクリアを目指そう。' : 'この難易度のスコア記録はまだありません。'}</p>`}${mine}<small class="rank-scope">記録送信がオンのプレイが対象です。</small>`;
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
  const reset = state => { state.mode = policy.id === 'legacy' ? 'score' : 'clear'; state.difficulty = policy.id; state.box.querySelector('select').value = state.difficulty; return refresh(state); };
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
  reset(title);
}
