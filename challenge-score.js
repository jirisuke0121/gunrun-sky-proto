// Port of saved Unity ChallengeScoreMath / ChallengeScorePresentation /
// ChallengeResultMotion. Gameplay owns points; presentation never awards them.
(() => {
  const f = Math.fround, ids = ['easy', 'normal', 'hard', 'expert', 'master', 'ultra'];
  const assets = './assets/challenge-score/';
  let game, frozen, previousMinute = -1, animation = 0, readyAt = 0, lastResult;
  let cachedScore, cachedTime, cachedKills, cachedLevel, hudKey = '', pauseKey = '';
  const $ = id => document.getElementById(id);
  const enabled = () => !!window.skyChallenge?.profile();
  const level = () => Math.max(0, ids.indexOf(window.skyChallenge.id));
  function evaluate(seconds, kills, difficulty) {
    // Unity's API receives remaining seconds on a 180-second clock. Keep that
    // float conversion, operation order and separate integer truncations.
    const remaining = f(180 - f(seconds)), elapsed = f(180 - remaining);
    const factor = f(1 + f(f(.1) * difficulty)), growth = f(f(elapsed / 60) + 1);
    const survival = Math.trunc(f(f(elapsed * factor) * growth));
    const kill = Math.trunc(f(f(f(kills * 2) * factor) * growth));
    return { elapsed, kills, difficulty: factor, growth, timeCoefficient: f(factor * growth),
      killCoefficient: f(f(2 * factor) * growth), survival, kill, total: survival + kill,
      bonus: 0, fellExtra: 0, shake: 0, scoring: 'unity-challenge-v1' };
  }
  function current() {
    if (frozen) return frozen;
    const time = Math.min(window.__game.RUN_LEN, game.z.t), kills = window.__game.stats.kills, difficulty = level();
    if (cachedScore && time === cachedTime && kills === cachedKills && difficulty === cachedLevel) return cachedScore;
    cachedTime = time; cachedKills = kills; cachedLevel = difficulty;
    return cachedScore = evaluate(time, kills, difficulty);
  }
  const set = (id, value) => { const e = $(id); if (e && e.textContent !== String(value)) e.textContent = value; };
  const image = (name, cls = '') => `<img class="${cls}" src="${assets + name}.webp" alt="" draggable="false">`;
  const bonus = b => `ボーナス +${Math.round((b.difficulty - 1) * 100)}%（×${b.difficulty.toFixed(1)}）`;
  function pulse(id, scale) {
    const e = $(id);
    if (!e || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const a of e.getAnimations()) a.cancel();
    e.animate([{ transform: 'scale(1)' }, { transform: `scale(${scale})`, offset: .625 }, { transform: 'scale(1)' }], { duration: 800, easing: 'ease-out' });
  }
  function reset() {
    cancelAnimationFrame(animation); frozen = null; lastResult = null; previousMinute = -1;
    cachedScore = null; hudKey = pauseKey = '';
    if ($('unityScoreDetails')) $('unityScoreDetails').hidden = true;
    sync();
  }
  function sync() {
    document.body.classList.toggle('unity-challenge-score', enabled());
    if (!game || !enabled()) return;
    const b = current(), mode = game.modeRef();
    $('unityScoreHud').hidden = mode !== 'play' || game.z.over;
    const remaining = Math.max(0, window.__game.RUN_LEN - b.elapsed).toFixed(0);
    const timeFactor = b.timeCoefficient.toFixed(1), killFactor = b.killCoefficient.toFixed(1);
    const key = `${window.skyChallenge.id}|${remaining}|${timeFactor}|${killFactor}|${b.kills}|${b.total}`;
    if (key !== hudKey) {
      hudKey = key;
      set('unityDifficulty', window.skyChallenge.name); set('unityTime', remaining);
      set('unityKills', b.kills); set('unityTotal', b.total.toLocaleString('ja-JP'));
      set('unityTimeFactor', '×' + timeFactor); set('unityKillFactor', '×' + killFactor);
    }
    set('unityHudStars', game.z.over ? '★'.repeat(game.z.stars || 0) + '☆'.repeat(3 - (game.z.stars || 0)) : '☆☆☆');
    const target = b.total < game.U.star2 ? `★2まで ${game.U.star2 - b.total}点` : b.total < game.U.star3 ? `★3まで ${game.U.star3 - b.total}点` : '★3の得点に到達';
    set('unityHudGoal', `${target} ・ 逃げ切ると星を獲得`);
    const minute = Math.floor(b.elapsed / 60);
    if (mode === 'play' && !game.z.over && (minute > previousMinute && minute > 0 || b.elapsed >= 1 && previousMinute < 0)) {
      for (const id of ['unityTime', 'unityTimeFactor', 'unityKillFactor']) pulse(id, 1.3);
      previousMinute = minute;
    }
    const detailKey = `${b.elapsed}|${b.kills}|${b.difficulty}`;
    if (mode === 'pause' && detailKey !== pauseKey) {
      pauseKey = detailKey;
      set('unityPauseIdentity', `${window.skyChallenge.name}　${bonus(b)}`);
      set('unityPauseSurvival', `生存 ${b.elapsed.toFixed(1)}秒 ×${b.timeCoefficient.toFixed(2)} → ${b.survival}点`);
      set('unityPauseKill', `撃破 ${b.kills}体 ×${b.killCoefficient.toFixed(2)} → ${b.kill}点`);
      set('unityPauseTotal', `合計 ${b.total}点`);
    }
  }
  function fit() {
    $('unityResultCard').dataset.compact = String($('app').clientHeight < 500);
  }
  function showResult(b, reason, best) {
    if (lastResult === b) return;
    lastResult = b; cancelAnimationFrame(animation); fit();
    const failed = reason !== 'time';
    $('unityResultCard').dataset.score = JSON.stringify(b);
    $('unityResultCard').dataset.failed = String(failed);
    $('unityResultCard').dataset.complete = 'false';
    const stars = failed ? 0 : 1 + Number(b.total >= game.U.star2) + Number(b.total >= game.U.star3);
    $('unityResultStars').setAttribute('aria-label', `星${stars}個、3個中`);
    $('unityResultStars').innerHTML = [1, 2, 3].map(i => `<span class="${i <= stars ? 'earned' : ''}" style="--star-index:${i}" aria-hidden="true">★</span>`).join('');
    $('unityResultStars').dataset.stars = stars;
    for (const [i, label] of ['2分逃げ切り', `${game.U.star2}点 ＋ 逃げ切り`, `${game.U.star3}点 ＋ 逃げ切り`].entries()) {
      set('unityStarGoal' + (i + 1), `★${i + 1}　${label}`);
      $('unityStarGoal' + (i + 1)).classList.toggle('achieved', i < stars);
    }
    set('unityResultTitle', failed ? (reason === 'fell' ? '落ちてしまった' : 'つかまった') : '逃げ切った！');
    set('unityResultGoal', failed ? `あと${Math.max(0, window.__game.RUN_LEN - b.elapsed).toFixed(1)}秒。まずは2分逃げ切って★1へ。` : stars < 3 ? `次は逃げ切ったうえで${stars === 1 ? game.U.star2 : game.U.star3}点を目指そう。` : '2分逃げ切り、3つの星を獲得！');
    set('unityEscapeRecord', `${b.elapsed.toFixed(1)} / ${window.__game.RUN_LEN}秒 ・ ${failed ? '未クリア' : window.skyChallenge.name + ' クリア'}`);
    set('unityRunMoves', `フック ${window.__game.stats.hooks || 0}　壁走り ${window.__game.stats.wallruns || 0}　乗り越え ${window.__game.stats.vaults || 0}　落下 ${window.__game.stats.falls || 0}`);
    set('unityResultDifficulty', `難易度　${window.skyChallenge.name}`);
    set('unityResultBonus', bonus(b));
    set('unityResultSurvival', b.survival.toLocaleString('ja-JP') + ' pt');
    set('unityResultKill', b.kill.toLocaleString('ja-JP') + ' pt');
    set('unitySurvivalFormula', `${b.elapsed.toFixed(1)}秒 ×${b.timeCoefficient.toFixed(2)}`);
    set('unityKillFormula', `${b.kills}体 ×${b.killCoefficient.toFixed(2)}`);
    set('unityResultEquation', `${b.survival} + ${b.kill} = ${b.total}点`);
    set('unityResultBest', best ? 'スコアベスト更新' : '今回のスコア');
    set('unityRunDetails', `生存 ${b.elapsed.toFixed(1)}秒 / 撃破 ${b.kills}体（落下撃破 ${window.__game.stats.drops}体）`);
    $('unityScoreDetails').hidden = true;
    $('unityResultCard').hidden = false;
    const buttons = [$('unityRetry'), $('unityMenu'), $('unityMore')];
    buttons.forEach(e => e.disabled = true);
    const started = performance.now(), reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    readyAt = started + (reduced ? 0 : 700);
    let soundedStars = 0;
    function tick(now) {
      const t = reduced ? .9 : (now - started) / 1000;
      if (!reduced && soundedStars < stars && t >= .2 + soundedStars * .18) game.Tt.star(soundedStars++);
      const count = Math.min(1, Math.max(0, (t - .2) / .6));
      set('unityResultTotal', Math.round(b.total * (1 - (1 - count) ** 3)).toLocaleString('ja-JP'));
      const settle = (1 - Math.min(1, t / .3)) ** 2;
      $('unityResultCard').style.transform = `translateY(${10 * settle}px) scale(${1 + .025 * settle})`;
      $('unityResultCard').style.opacity = Math.min(1, t / .18);
      $('unityResultContent').style.opacity = Math.min(1, Math.max(0, (t - .14) / .25));
      $('unityResultActions').style.opacity = Math.min(1, Math.max(0, (t - .45) / .25));
      buttons.forEach(e => e.disabled = now < readyAt);
      if (t < .9) { animation = requestAnimationFrame(tick); return; }
      set('unityResultTotal', b.total.toLocaleString('ja-JP'));
      $('unityResultCard').dataset.complete = 'true';
      $('unityResultCard').style.transform = '';
      buttons.forEach(e => e.disabled = false);
      $('unityRetry').focus({ preventScroll: true });
    }
    animation = requestAnimationFrame(tick);
  }
  function attach(internals) {
    game = internals;
    for (const name of ['milestoneBonus', 'shakePts']) $('s_' + name)?.closest('.sl')?.classList.add('legacy-score-setting');
    const hud = document.createElement('div'); hud.id = 'unityScoreHud';
    hud.innerHTML = `<div id="unityDifficulty"></div><div class="unity-counter">${image('clock')}<b id="unityTime">120</b><small>秒</small><span>時間倍率 <strong id="unityTimeFactor">×1.0</strong></span></div><div class="unity-counter">${image('skull')}<b id="unityKills">0</b><span>撃破倍率 <strong id="unityKillFactor">×2.0</strong></span></div><div class="unity-counter unity-score">${image('star')}<b id="unityTotal">0</b><span>SCORE</span></div><div class="uc-hud-goal"><b id="unityHudStars" aria-hidden="true">☆☆☆</b><span id="unityHudGoal"></span></div>`;
    $('hud').append(hud);
    // Difficulty belongs with the other status lines, not floating under the header (it collided with hints).
    $('hud').querySelector('.hud-tl')?.prepend($('unityDifficulty'));
    const pause = document.createElement('aside'); pause.id = 'unityScorePause';
    pause.innerHTML = `<h3>得点の内訳</h3><p id="unityPauseIdentity"></p><p id="unityPauseSurvival"></p><p id="unityPauseKill"></p><b id="unityPauseTotal"></b><small>長く生存するほど得点アップ。難易度ボーナスは各得点に反映済み。</small>`;
    $('challengeSettingsNote').after(pause);
    const result = document.createElement('div'); result.id = 'unityScoreResult';
    result.innerHTML = `<article id="unityResultCard"><header><span class="uc-caption">空中回廊 / 逃走の記録</span><span id="unityResultDifficulty"></span><h2 id="unityResultTitle"></h2></header><div id="unityResultContent"><section class="uc-achievement"><div id="unityResultStars" role="img"></div><p id="unityEscapeRecord"></p><div class="uc-star-goals"><span id="unityStarGoal1"></span><span id="unityStarGoal2"></span><span id="unityStarGoal3"></span></div><p id="unityResultGoal"></p></section><section class="uc-points"><span id="unityResultBest"></span><div class="uc-total"><b id="unityResultTotal">0</b><small> pt</small></div><div class="uc-breakdown"><div><span>生存</span><b id="unityResultSurvival"></b><small id="unitySurvivalFormula"></small></div><div><span>撃破</span><b id="unityResultKill"></b><small id="unityKillFormula"></small></div></div><small id="unityResultBonus"></small><small id="unityResultEquation"></small></section><p id="unityRunMoves"></p></div><footer id="unityResultActions"><button id="unityRetry" type="button">もう一度逃げる</button><button id="unityMore" type="button">ランキング・記録</button><button id="unityMenu" type="button">メニュー</button></footer></article><section id="unityScoreDetails" hidden><h2>ランキング・プレイの記録</h2><p id="unityRunDetails"></p><div id="unityScoreRanking"></div><p id="unityRecordStatus"></p><button id="unityDetailsBack" type="button">リザルトに戻る</button></section>`;
    $('ovOver').append(result);
    $('unityScoreDetails').setAttribute('role', 'dialog');
    $('unityScoreDetails').setAttribute('aria-label', 'ランキング・プレイの記録');
    $('unityResultCard').setAttribute('role', 'dialog');
    $('unityResultCard').setAttribute('aria-labelledby', 'unityResultTitle');
    $('unityRetry').addEventListener('click', () => $('bRetry').click());
    $('unityMenu').addEventListener('click', () => $('bMenu2').click());
    $('unityMore').addEventListener('click', () => { $('unityScoreDetails').hidden = false; $('unityResultCard').hidden = true; $('unityDetailsBack').focus(); });
    $('unityDetailsBack').addEventListener('click', () => { $('unityScoreDetails').hidden = true; $('unityResultCard').hidden = false; $('unityMore').focus(); });
    new ResizeObserver(fit).observe($('app'));
    for (const id of ['hud', 'ovPause', 'ovStart']) new MutationObserver(sync).observe($(id), { attributes: true, attributeFilter: ['hidden', 'class'] });
    new MutationObserver(() => set('unityRecordStatus', $('oLog').textContent)).observe($('oLog'), { childList: true, characterData: true, subtree: true });
    document.addEventListener('sky-difficulty-change', () => { frozen = null; sync(); });
    window.addEventListener('keydown', e => {
      if (enabled() && game.modeRef() === 'over' && performance.now() < readyAt && ['KeyR', 'Enter', 'Space'].includes(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    fit(); sync();
  }
  window.skyChallengeScore = { enabled, level, evaluate, current, reset, sync, attach, showResult,
    freeze() { return frozen ||= Object.freeze({ ...current() }); },
    killed() { if (enabled() && !game.z.over) { sync(); pulse('unityKills', 1.2); } },
  };
})();
