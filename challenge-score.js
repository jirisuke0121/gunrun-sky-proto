// Port of saved Unity ChallengeScoreMath / ChallengeScorePresentation /
// ChallengeResultMotion. Gameplay owns points; presentation never awards them.
(() => {
  const f = Math.fround, ids = ['easy', 'normal', 'hard'];
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
    const time = Math.min(window.__game.RUN_LEN, game.z.t), kills = window.__game.stats.kills ?? 0, difficulty = level();
    if (cachedScore && time === cachedTime && kills === cachedKills && difficulty === cachedLevel) return cachedScore;
    cachedTime = time; cachedKills = kills; cachedLevel = difficulty;
    return cachedScore = evaluate(time, kills, difficulty);
  }
  const set = (id, value) => { const e = $(id); if (e && e.textContent !== String(value)) e.textContent = value; };
  const image = (name, cls = '') => `<img class="${cls}" src="${assets + name}.webp" alt="" draggable="false">`;
  const bonus = b => `難易度ボーナス ×${b.difficulty.toFixed(1)}（+${Math.round((b.difficulty - 1) * 100)}%）`;
  const growthBonus = b => `生存時間ボーナス ×${b.growth.toFixed(2)}`;
  const survivalFormula = b => `${b.elapsed.toFixed(1)}秒 × 1点 × ${b.difficulty.toFixed(1)} × ${b.growth.toFixed(2)}`;
  const killFormula = b => `${b.kills}体 × 2点 × ${b.difficulty.toFixed(1)} × ${b.growth.toFixed(2)}`;
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
    const minute = Math.floor(b.elapsed / 60);
    if (mode === 'play' && !game.z.over && (minute > previousMinute && minute > 0 || b.elapsed >= 1 && previousMinute < 0)) {
      for (const id of ['unityTime', 'unityTimeFactor', 'unityKillFactor']) pulse(id, 1.3);
      previousMinute = minute;
    }
    const detailKey = `${b.elapsed}|${b.kills}|${b.difficulty}`;
    if (mode === 'pause' && detailKey !== pauseKey) {
      pauseKey = detailKey;
      set('unityPauseIdentity', `${window.skyChallenge.name}　${bonus(b)} / ${growthBonus(b)}`);
      set('unityPauseSurvival', `生存点：${survivalFormula(b)} → ${b.survival}点`);
      set('unityPauseKill', `撃破点：${killFormula(b)} → ${b.kill}点`);
      set('unityPauseTotal', `合計 ${b.total}点`);
    }
  }
  function fit() {
    const app = $('app'), card = $('unityResultCard');
    card.dataset.compact = String(app.clientHeight < 500);
    card.dataset.tiny = String(app.clientHeight < 350);
    card.style.setProperty('--result-height', Math.max(220, app.clientHeight - (app.clientHeight < 350 ? 8 : 24)) + 'px');
  }
  function showResult(b, reason, best) {
    if (lastResult === b) return;
    lastResult = b; cancelAnimationFrame(animation); fit();
    const intro = window.skyChallenge.isIntroRun;
    const failed = reason !== 'time';
    $('unityResultCard').classList.toggle('intro-result', intro);
    $('introNext').hidden = !intro;
    $('unityRetry').textContent = intro ? '入門をもう一度' : 'もう一度逃げる';
    $('unityResultCard').dataset.score = JSON.stringify(b);
    $('unityResultCard').dataset.failed = String(failed);
    $('unityResultCard').dataset.complete = 'false';
    set('unityResultTitle', failed ? (reason === 'fell' ? '落ちてしまった' : 'つかまった') : '逃げ切った！');
    set('unityResultGoal', failed ? `あと${Math.max(0, window.__game.RUN_LEN - b.elapsed).toFixed(1)}秒で逃げ切り` : '2分間の逃走をクリア');
    set('unityEscapeRecord', `生存 ${b.elapsed.toFixed(1)}秒 ／ 撃破 ${b.kills}体`);
    set('unityRunMoves', `フック ${window.__game.stats.hooks || 0}　壁走り ${window.__game.stats.wallruns || 0}　乗り越え ${window.__game.stats.vaults || 0}　落下 ${window.__game.stats.falls || 0}`);
    set('unityResultDifficulty', `難易度　${window.skyChallenge.name}`);
    set('unityResultBonus', '×' + b.difficulty.toFixed(1));
    set('unityResultGrowth', '×' + b.growth.toFixed(2));
    set('unitySurvivalMetric', b.elapsed.toFixed(1) + '秒');
    set('unityKillMetric', b.kills + '体');
    set('unityResultSurvival', b.survival.toLocaleString('ja-JP') + ' pt');
    set('unityResultKill', b.kill.toLocaleString('ja-JP') + ' pt');
    set('unitySurvivalFormula', survivalFormula(b));
    set('unityKillFormula', killFormula(b));
    set('unityResultEquation', `生存 ${b.survival} ＋ 撃破 ${b.kill} ＝ ${b.total}点`);
    set('unityResultBest', best ? '自己ベスト更新' : '今回のスコア');
    $('unityResultBest').dataset.best = String(!!best);
    set('unityRunDetails', `生存 ${b.elapsed.toFixed(1)}秒 / 撃破 ${b.kills}体（落下撃破 ${window.__game.stats.drops}体）`);
    if (intro) {
      set('unityResultTitle', '入門モード、おつかれさま！');
      set('unityResultGoal', '次はイージー・ノーマル・ハードから選んで挑戦できます。');
      set('unityEscapeRecord', 'ライフ無限の入門体験 · ランキング対象外');
      set('unityResultBest', 'この入門の記録は保存・送信しません');
    }
    $('unityScoreDetails').hidden = true;
    $('unityScoreMath').open = false;
    $('unityResultCard').hidden = false;
    const buttons = [$('unityRetry'), $('unityMenu'), $('unityMore'), $('introNext')];
    buttons.forEach(e => e.disabled = true);
    const started = performance.now(), reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    readyAt = started + (reduced ? 0 : 700);
    function tick(now) {
      const t = reduced ? .9 : (now - started) / 1000;
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
    for (const name of ['star2', 'star3']) $('s_' + name)?.closest('.sl')?.setAttribute('hidden', '');
    for (const name of ['milestoneBonus', 'shakePts', 'star2', 'star3']) $('s_' + name)?.closest('.sl')?.classList.add('legacy-score-setting');
    const hud = document.createElement('div'); hud.id = 'unityScoreHud';
    hud.innerHTML = `<div id="unityDifficulty"></div><div class="unity-counter">${image('clock')}<b id="unityTime">120</b><small>秒</small><span>時間倍率 <strong id="unityTimeFactor">×1.0</strong></span></div><div class="unity-counter">${image('skull')}<b id="unityKills">0</b><small>撃破</small><span>撃破倍率 <strong id="unityKillFactor">×2.0</strong></span></div><div class="unity-counter unity-score"><b id="unityTotal">0</b><small>点</small><span>SCORE</span></div>`;
    $('hud').append(hud);
    // Difficulty belongs with the other status lines, not floating under the header (it collided with hints).
    $('hud').querySelector('.hud-tl')?.prepend($('unityDifficulty'));
    const pause = document.createElement('aside'); pause.id = 'unityScorePause';
    pause.innerHTML = `<h3>得点の内訳</h3><p id="unityPauseIdentity"></p><p id="unityPauseSurvival"></p><p id="unityPauseKill"></p><b id="unityPauseTotal"></b><small>生存時間ボーナス ＝ 1 ＋ 生存秒数 ÷ 60。両方のボーナスを生存点・撃破点に適用。式の秒数・倍率は概数、各得点は小数点以下切り捨て。</small>`;
    $('challengeSettingsNote').after(pause);
    const result = document.createElement('div'); result.id = 'unityScoreResult';
    result.innerHTML = `<article id="unityResultCard"><header><div class="uc-result-top"><span class="uc-caption">空中回廊 <span>/ RESULT</span></span><span id="unityResultDifficulty"></span></div><div class="uc-result-heading"><div><h2 id="unityResultTitle"></h2><p id="unityEscapeRecord"></p></div><p id="unityResultGoal"></p></div></header><div id="unityResultContent"><section class="uc-points"><span id="unityResultBest"></span><div class="uc-total"><b id="unityResultTotal">0</b><small>pt</small></div><p class="uc-total-label">生存点 ＋ 撃破点</p></section><section class="uc-ledger" aria-label="スコア内訳"><div class="uc-breakdown"><div>${image('clock')}<span>生存<small id="unitySurvivalMetric"></small></span><b id="unityResultSurvival"></b></div><div>${image('skull')}<span>撃破<small id="unityKillMetric"></small></span><b id="unityResultKill"></b></div></div><div class="uc-bonuses"><div><span>難易度</span><b id="unityResultBonus"></b></div><div><span>生存時間</span><b id="unityResultGrowth"></b></div></div><p class="uc-score-help">ボーナスは生存点・撃破点に反映済み</p></section><details id="unityScoreMath" class="uc-math"><summary>スコアの計算を見る</summary><div><p>生存点：<span id="unitySurvivalFormula"></span></p><p>撃破点：<span id="unityKillFormula"></span></p><p id="unityResultEquation"></p><p>生存時間ボーナス ＝ 1 ＋ 生存秒数 ÷ 60。長く生存すると、これまでの撃破点も増えます。式の秒数・倍率は概数、各得点は小数点以下切り捨て。</p><p id="unityRunMoves"></p></div></details></div><footer id="unityResultActions"><button id="unityRetry" type="button">もう一度逃げる</button><button id="unityMenu" type="button">ホームへ</button><button id="unityMore" type="button">ランキング・記録</button></footer></article><section id="unityScoreDetails" hidden><h2>ランキング・プレイの記録</h2><p id="unityRunDetails"></p><div id="unityScoreRanking"></div><p id="unityRecordStatus"></p><button id="unityDetailsBack" type="button">リザルトに戻る</button></section>`;
    $('ovOver').append(result);
    const next = document.createElement('button'); next.id = 'introNext'; next.type = 'button';
    next.textContent = 'イージーから挑戦する'; next.hidden = true;
    $('unityResultActions').prepend(next);
    next.addEventListener('click', async () => {
      window.__game.setMode('menu'); await Promise.resolve();
      const custom = $('challengeCustom'); if (custom.checked) custom.click();
      $('challengeDifficulty').value = 'easy'; $('challengeDifficulty').dispatchEvent(new Event('change'));
    });
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
