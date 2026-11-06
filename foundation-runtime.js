import { randomUUID } from './random-uuid.js?v=20261106-lan-v1';
import { createAutoResolutionMonitor } from './auto-resolution-monitor.js?v=20261101-foundation-v1';
import { createFrameMetrics } from './foundation-metrics.js?v=20261101-foundation-v1';
import { collectEnvironment } from './environment-profile.js?v=20261102-environment-v1';

// Independent of result/ghost delivery. No requests or failures block gameplay.
const BUILD = '2026-11-02-players-v1';
const endpoint = 'https://gunrun-runs.jirisuke0121.workers.dev/telemetry';
const session = randomUUID();
let game, publicGame, round = null, finished = null, starts = 0, errors = 0;
const CHECK_KEY = 'gunrun-quality-check-v1';
let qualityChecked = false, suggestion = null;
try { qualityChecked = localStorage.getItem(CHECK_KEY) === 'done'; } catch {}
const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const search = new URLSearchParams(location.search);
const dev = local || search.has('practice') || search.has('perf') || search.has('oldtown_swing') || search.has('swingCourse');
const map = location.pathname.endsWith('canyon.html') ? 'rock-canyon' : 'old-town';
let host = location.hostname;
try { if (document.referrer) host += ' ' + new URL(document.referrer).hostname; } catch {}
const source = /(^|[ .])(?:y8\.com|y8games\.com)(?:$| )/.test(host) ? 'y8' : location.hostname === 'jirisuke0121.github.io' ? 'github' : 'unknown';
const ua = navigator.userAgent;
const device = /iPhone|iPod/.test(ua) ? 'iphone' : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'ipad' : /Android/.test(ua) ? 'android' : 'desktop';
const environment = collectEnvironment(navigator, window.screen, window.devicePixelRatio);
function allowed() {
  if (window.skyOwnerReplay || dev || window.skyDevMode || window.skyPracticeMode || window.skyChallenge?.debug || window.skyChallenge?.isIntroRun || game?.z.mission) return false;
  if (game) return game.U.sendLog === true;
  try { return JSON.parse(localStorage.getItem('gunrun-sky-proto-v1') || '{}').sendLog !== false; } catch { return true; }
}
let playerId;
function player() {
  if(window.skyRunRecording?.player)playerId=window.skyRunRecording.player;
  if(playerId)return playerId;
  try {playerId=localStorage.getItem('gunrun-pid');if(!playerId){playerId=randomUUID();localStorage.setItem('gunrun-pid',playerId)}}catch{}
  return playerId || null;
}
function name(){try{return localStorage.getItem('gunrun-name')||null}catch{return null}}
function send(event, extra = {}) {
  if (!allowed()) return;
  const body = JSON.stringify({ v: 1, id: randomUUID(), session, event, build: BUILD, map, source,
    device, environment, player:player(), name:name(),
    difficulty: game?.z.challenge?.id || window.skyChallenge?.id || 'unknown', ...extra });
  try { fetch(endpoint, { method: 'POST', headers: { 'content-type': 'text/plain;charset=UTF-8' }, body, keepalive: true }).catch(() => {}); } catch {}
}
function qualitySnapshot() {
  const snapshot = window.skyRenderQuality?.snapshot();
  return snapshot ? { quality: snapshot.mode, ratio: snapshot.pixelRatio, nativeRatio: snapshot.nativePixelRatio,
    width: snapshot.buffer?.[0] ?? null, height: snapshot.buffer?.[1] ?? null,
    viewportWidth: publicGame?.debug.renderer.domElement.clientWidth || innerWidth,
    viewportHeight: publicGame?.debug.renderer.domElement.clientHeight || innerHeight, shadows: snapshot.shadows } : null;
}
function finishRound(reason) {
  if (!round) return;
  const value = round; round = null;
  finished = value.metrics.snapshot();
  if (finished) finished = { ...finished, ...qualitySnapshot() };
  send('finish', { run: value.id, difficulty: value.difficulty, reason, performance: finished });
  const quality = window.skyRenderQuality;
  if (!qualityChecked && !value.excluded && value.quality === 'high' && quality?.revision === value.revision) {
    if (value.monitor.shouldReduce) suggestion = { revision: value.revision };
    else if (value.monitor.evaluated) markQualityChecked();
  }
  quality?.finishRound();
}
function markQualityChecked() {
  qualityChecked = true;
  try { localStorage.setItem(CHECK_KEY, 'done'); } catch {}
}
function showQualitySuggestion() {
  if (!suggestion) return;
  const value = suggestion; suggestion = null;
  if (window.skyRenderQuality?.revision !== value.revision) return;
  const dialog = document.createElement('dialog'); dialog.id = 'qualitySuggestion';
  dialog.setAttribute('aria-labelledby', 'qualitySuggestionTitle');
  dialog.setAttribute('aria-describedby', 'qualitySuggestionDescription');
  dialog.innerHTML = '<h2 id="qualitySuggestionTitle">描画を軽くしますか？</h2><p id="qualitySuggestionDescription">最初のプレイで動作が重い状態が続きました。軽量にすると3D描画の細かさを抑え、影を省きます。操作やゲームのルールは変わりません。設定からいつでも戻せます。</p><div><button type="button" id="qualityAccept">軽量にする</button><button type="button" id="qualityKeep">高画質を続ける</button></div>';
  Object.assign(dialog.style, { maxWidth: 'min(460px,90vw)', padding: '24px', borderRadius: '12px', color: '#f4efe4', background: '#272b2f', lineHeight: '1.7' });
  for (const button of dialog.querySelectorAll('button')) Object.assign(button.style, { font: 'inherit', padding: '12px', margin: '6px', cursor: 'pointer' });
  function close(accept) {
    if (accept) window.skyRenderQuality.select('performance');
    markQualityChecked(); dialog.close(); dialog.remove(); document.getElementById('bStart')?.focus();
  }
  dialog.querySelector('#qualityAccept').addEventListener('click', () => close(true));
  dialog.querySelector('#qualityKeep').addEventListener('click', () => close(false));
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(false); });
  document.body.append(dialog); document.exitPointerLock?.(); dialog.showModal();
}
window.skyFoundation = {
  profile(){return {device,source,environment:{...environment}}},
  attach(s, g) { game = s; publicGame = g; send('home'); },
  beginRound(id) {
    finishRound('quit');
    finished = null;
    window.skyRenderQuality?.beginRound();
    round = { id, monitor: createAutoResolutionMonitor(), metrics: createFrameMetrics(),
      quality: window.skyRenderQuality?.mode, revision: window.skyRenderQuality?.revision,
      difficulty: game?.z.challenge?.id || window.skyChallenge?.id || 'unknown',
      excluded: !!(window.skyDevMode || window.skyPracticeMode || window.skyChallenge?.debug || game?.z.mission) };
    starts++;
    send('start', { run: id });
    if (starts > 1) send('retry', { run: id });
  },
  frame(now, active) {
    if (!round) return;
    active = active && !document.hidden && document.hasFocus();
    round.monitor.sample(now, active && !round.excluded, true);
    round.metrics.sample(now, active);
  },
  modeChanged(mode) {
    if (mode === 'menu') { finishRound('quit'); showQualitySuggestion(); }
    if (mode === 'pause') { round?.metrics.sample(NaN, false); round?.monitor.sample(NaN, false, false); }
  },
  finishRound,
  // The intro run's result screen asks the same question as the home dialog; one answer settles both.
  qualityAdvice() { return { heavy: !!suggestion && window.skyRenderQuality?.revision === suggestion.revision }; },
  answerQualityAdvice(accept) {
    const value = suggestion; if (!value) return; suggestion = null;
    if (window.skyRenderQuality?.revision !== value.revision) return;
    if (accept) window.skyRenderQuality.select('performance');
    markQualityChecked();
  },
  resetQualityCheck() { qualityChecked = false; suggestion = null; try { localStorage.removeItem(CHECK_KEY); } catch {} },
  performance() { return finished ? { ...finished } : null; },
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { round?.metrics.sample(NaN, false); round?.monitor.sample(NaN, false, false); }
});
addEventListener('blur', () => { round?.metrics.sample(NaN, false); round?.monitor.sample(NaN, false, false); });
addEventListener('pagehide', () => finishRound('quit'));
function reportError(kind) { if (errors++ < 5) send('error', { error: kind, run: round?.id ?? null }); }
addEventListener('error', event => reportError(event.target === window ? 'javascript' : 'resource'), true);
addEventListener('unhandledrejection', () => reportError('promise'));
send('boot');
