// Simulation time and actual combat own points; presentation never awards them.
(() => {
  const ids = ['easy', 'normal', 'hard'];
  const assets = './assets/challenge-score/';
  let game, frozen, previousMinute = -1, animation = 0, readyAt = 0, lastResult;
  let tracker, fx, hudKey = '', pauseKey = '';
  // Every `interval` seconds the survival points are paid out as a visible milestone.
  let previousTick = 0, shown = 0, roll = null, barKey = -1, tickAnimation;
  const $ = id => document.getElementById(id);
  const enabled = () => !!window.skyChallenge?.profile();
  const level = () => Math.max(0, ids.indexOf(window.skyChallenge.id));
  const evaluate = (...args) => window.skySurvivalScore.evaluate(...args);
  const playing = () => game && enabled() && !game.z.over && !game.z.mission &&
    !window.skyPracticeMode && !game.demoActive?.() && game.modeRef() === 'play';
  function current() {
    if (frozen) return frozen;
    const st = window.__game.stats;
    // Jump-gun launches fire the gun internally; they are movement, not shooting.
    const gunShots = Math.max(0, (st.shots || 0) - (st.jumpGunLaunches || 0));
    return evaluate(Math.min(window.__game.RUN_LEN, game.z.t), st.kills || 0,
      level(), { ...tracker?.snapshot(), gunShots });
  }
  function feedback(escape) {
    if (!playing()) return;
    if (escape) fx.escaped();
    else fx.kill(Math.round(window.skySurvivalScore.config.perKill * (1 + level() * .1)));
  }
  function step(dt) {
    fx?.setActive(playing());
    if (!playing() || document.hidden) return;
    tracker?.step(dt); fx?.step(dt);
  }
  function damaged(amount, position) {
    if (!playing() || !Number.isFinite(amount) || amount <= 0) return;
    const before = current().damage;
    tracker?.damaged(amount);
    fx?.damage(amount, current().damage - before, position);
  }
  const set = (id, value) => { const e = $(id); if (e && e.textContent !== String(value)) e.textContent = value; };
  const image = (name, cls = '') => `<img class="${cls}" src="${assets + name}.webp" alt="" draggable="false">`;
  const bonus = b => `難易度ボーナス ×${b.difficulty.toFixed(1)}（+${Math.round((b.difficulty - 1) * 100)}%）`;
  function pulse(id, scale) {
    const e = $(id);
    if (!e || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const a of e.getAnimations()) a.cancel();
    e.animate([{ transform: 'scale(1)' }, { transform: `scale(${scale})`, offset: .625 }, { transform: 'scale(1)' }], { duration: 800, easing: 'ease-out' });
  }
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function award(b) {
    const el = $('unityTickAward'); if (!el) return;
    // Milestones on a 30 s boundary get the large gold treatment (every payout at the 30 s interval).
    const major = (b.ticks * b.interval) % 30 === 0;
    el.dataset.major = String(major);
    el.querySelector('b').textContent = '+' + b.tickPoints.toLocaleString('ja-JP');
    el.querySelector('small').textContent = `${b.ticks * b.interval}秒生存`;
    el.hidden = false; tickAnimation?.cancel();
    const reduced = reducedMotion(), duration = major ? 1800 : 1200;
    const frames = reduced
      ? [{ opacity: 1 }, { opacity: 1, offset: .8 }, { opacity: 0 }]
      : [{ opacity: 0, transform: 'translateY(-8px) scale(.82)', easing: 'ease-out' },
         { opacity: 1, transform: `translateY(0) scale(${major ? 1.16 : 1.08})`, offset: .12, easing: 'ease-out' },
         { opacity: 1, transform: 'translateY(0) scale(1)', offset: .22 },
         { opacity: 1, transform: 'translateY(0) scale(1)', offset: .78 },
         { opacity: 0, transform: 'translateY(6px) scale(1)' }];
    const animation = tickAnimation = el.animate(frames, { duration, easing: 'linear' });
    animation.onfinish = () => { if (tickAnimation === animation) el.hidden = true; };
    if (!reduced) roll = { from: shown, at: performance.now() };
    pulse('unityTotal', major ? 1.2 : 1.12); pulse('unityTime', major ? 1.3 : 1.15);
    fx?.tick(major);
  }
  function reset() {
    cancelAnimationFrame(animation); frozen = null; lastResult = null; previousMinute = -1;
    previousTick = 0; shown = 0; roll = null; barKey = -1; tickAnimation?.cancel(); tickAnimation = null;
    if ($('unityTickAward')) $('unityTickAward').hidden = true;
    tracker = window.skySurvivalScore.createTracker(game, window.__game, () => feedback(true));
    hudKey = pauseKey = ''; fx?.reset();
    if ($('unityScoreDetails')) $('unityScoreDetails').hidden = true;
    sync();
  }
  function sync() {
    document.body.classList.toggle('unity-challenge-score', enabled());
    if (!game || !enabled()) { fx?.setActive(false); return; }
    const b = current(), mode = game.modeRef();
    const active = mode === 'play' && !game.z.over;
    $('unityScoreHud').hidden = !active;
    fx?.setActive(playing());
    const remaining = Math.max(0, window.__game.RUN_LEN - b.elapsed).toFixed(0);
        const killFactor = Math.round(window.skySurvivalScore.config.perKill * b.difficulty);
    // The HUD total counts paid-out milestones; the unpaid part of the current interval
    // is settled when the run ends (the result shows the full survival points).
    let value = b.live;
    if (roll && !frozen) {
      const u = Math.min(1, (performance.now() - roll.at) / 380);
      value = Math.round(roll.from + (b.live - roll.from) * (1 - (1 - u) ** 3));
      if (u >= 1) roll = null;
    }
    shown = value;
    const parkourLive = b.kills === 0 && b.gunShots === 0;
    const key = `${window.skyChallenge.id}|${remaining}|${b.tickPoints}|${killFactor}|${b.kills}|${value}|${parkourLive}`;
    if (key !== hudKey) {
      hudKey = key;
      set('unityDifficulty', window.skyChallenge.name + (parkourLive ? `　パルクール ×${window.skySurvivalScore.config.parkour}` : '')); set('unityTime', remaining);
      set('unityKills', b.kills); set('unityTotal', value.toLocaleString('ja-JP'));
      set('unityTimeFactor', `+${b.tickPoints}/${b.interval}秒`); set('unityKillFactor', killFactor + '点/体');
    }
    if (mode === 'play' && !game.z.over) {
      const gap = b.ticks - previousTick;
      // Only a milestone crossed just now is celebrated; anything else is a silent resync.
      if (gap === 1 && b.elapsed - b.ticks * b.interval < 1) award(b);
      previousTick = b.ticks;
      const step = Math.round((b.elapsed - b.ticks * b.interval) / b.interval * 100);
      if (step !== barKey) { barKey = step; $('unityTickBar').firstChild.style.transform = `scaleX(${step / 100})`; }
    }
    const minute = Math.floor(b.elapsed / 60);
    if (mode === 'play' && !game.z.over && (minute > previousMinute && minute > 0 || b.elapsed >= 1 && previousMinute < 0)) {
      for (const id of ['unityTime', 'unityTimeFactor', 'unityKillFactor']) pulse(id, 1.3);
      previousMinute = minute;
    }
    const detailKey = `${b.elapsed}|${b.kills}|${b.difficulty}|${b.damageUnits}`;
    if (mode === 'pause' && detailKey !== pauseKey) {
      pauseKey = detailKey;
      set('unityPauseIdentity', `${window.skyChallenge.name}　${bonus(b)}`);
      set('unityPauseSurvival', `生存 ${b.elapsed.toFixed(1)}秒 → ${b.survival}点`);
      set('unityPauseKill', `撃破 ${b.kills}体 → ${b.kill}点 ／ ダメージ ${b.damageUnits.toFixed(1)} → ${b.damage}点`);
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
    $('unityResultCard').dataset.longScore = String(b.total >= 100000);
    $('unityResultCard').dataset.failed = String(failed);
    $('unityResultCard').dataset.complete = 'false';
    set('unityResultTitle', failed ? (reason === 'fell' ? '落ちてしまった' : 'つかまった') : '逃げ切った！');
    set('unityResultGoal', failed ? `あと${Math.max(0, window.__game.RUN_LEN - b.elapsed).toFixed(1)}秒で逃げ切り` : '2分間の逃走をクリア');
    set('unityEscapeRecord', `生存 ${b.elapsed.toFixed(1)}秒 ／ 撃破 ${b.kills}体`);
    set('unityRunMoves', `フック ${window.__game.stats.hooks || 0}　壁走り ${window.__game.stats.wallruns || 0}　乗り越え ${window.__game.stats.vaults || 0}　落下 ${window.__game.stats.falls || 0}`);
    set('unityResultDifficulty', `難易度　${window.skyChallenge.name}`);
    set('unityResultBonus', '×' + b.difficulty.toFixed(1));
    set('unitySurvivalMetric', b.elapsed.toFixed(1) + '秒');
    set('unityResultSurvival', b.survival.toLocaleString('ja-JP') + ' pt');
    set('unityResultKill', b.kill.toLocaleString('ja-JP') + ' pt');
    set('unitySurvivalFormula', `${b.interval}秒ごと ${b.ticks}回 × ${b.tickPoints}点 ＋ 端数 ${b.remainder}点`);
    set('unityResultDamage', b.damage.toLocaleString('ja-JP') + ' pt');
    set('unityDamageFormula', `有効ダメージ ${b.damageUnits.toFixed(1)} × 2点 × ${b.difficulty.toFixed(1)}`);
    set('unityKillFormula', `${b.kills}体 × ${window.skySurvivalScore.config.perKill}点 × ${b.difficulty.toFixed(1)}`);
    $('unityParkourRow').hidden = !b.parkour;
    set('unityResultParkour', '+' + (b.parkourBonus || 0).toLocaleString('ja-JP') + ' pt');
    set('unityParkourFormula', `銃撃・撃破なしで完走　小計 × ${window.skySurvivalScore.config.parkour}`);
    set('unityResultEquation', [b.survival, b.damage, b.kill, ...(b.parkour ? [b.parkourBonus] : [])].map(n => n.toLocaleString('ja-JP')).join(' + ') + ' = ' + b.total.toLocaleString('ja-JP') + ' pt');
    set('unityResultTotal', b.total.toLocaleString('ja-JP'));
    set('unityResultBest', best ? '自己ベスト更新' : '');
    $('unityResultBest').dataset.best = String(!!best);
    set('unityRunDetails', `生存 ${b.elapsed.toFixed(1)}秒 / 撃破 ${b.kills}体（落下撃破 ${window.__game.stats.drops}体）`);
    for (const id of ['unityRetry', 'introNext']) $(id).classList.remove('is-recommended');
    $('unityAdvicePerf').hidden = true;
    if (intro) {
      // The first run's result decides what to recommend next (and whether to offer lighter graphics).
      const advice = window.skyNextStep.adviseNext({ elapsed: b.elapsed, cleared: !failed, reason });
      $(advice.primary === 'next' ? 'introNext' : 'unityRetry').classList.add('is-recommended');
      $('unityAdvicePerf').hidden = !window.skyFoundation?.qualityAdvice?.().heavy;
      set('unityResultTitle', advice.title);
      set('unityResultGoal', advice.goal);
      set('unityEscapeRecord', 'ライフ無限の入門体験 · ランキング対象外');
      set('unityResultBest', 'この入門の記録は保存・送信しません');
    }
    $('unityScoreDetails').hidden = true;
    $('unityResultCard').hidden = false;
    if (intro) document.dispatchEvent(new CustomEvent('sky-intro-result'));
    const buttons = [$('unityRetry'), $('unityMenu'), $('unityMore'), $('introNext')];
    buttons.forEach(e => e.disabled = true);
    const started = performance.now(), reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    readyAt = started + (reduced ? 0 : 700);
    function tick(now) {
      const t = reduced ? .9 : (now - started) / 1000;
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
    hud.innerHTML = `<div id="unityDifficulty"></div><div class="unity-counter">${image('clock')}<b id="unityTime">120</b><small>秒</small><span>生存 <strong id="unityTimeFactor">+0/5秒</strong></span><i id="unityTickBar" aria-hidden="true"><u></u></i></div><div class="unity-counter">${image('skull')}<b id="unityKills">0</b><small>撃破</small><span>撃破 <strong id="unityKillFactor">100点/体</strong></span></div><div class="unity-counter unity-score"><b id="unityTotal">0</b><small>点</small><span>SCORE</span></div><div id="unityTickAward" hidden aria-hidden="true">${image('clock-medal')}<span><b></b><small></small></span></div>`;
    $('hud').append(hud);
    fx = window.createSkyCombatFeedback(game, playing);
    // Difficulty belongs with the other status lines, not floating under the header (it collided with hints).
    $('hud').querySelector('.hud-tl')?.prepend($('unityDifficulty'));
    const pause = document.createElement('aside'); pause.id = 'unityScorePause';
    pause.innerHTML = `<h3>得点の内訳</h3><p id="unityPauseIdentity"></p><p id="unityPauseSurvival"></p><p id="unityPauseKill"></p><b id="unityPauseTotal"></b><small>生き残った時間と、有効ダメージ・撃破で得点。難易度ボーナスは反映済み。</small>`;
    $('challengeSettingsNote').after(pause);
    const result = document.createElement('div'); result.id = 'unityScoreResult';
    result.innerHTML = `
      <article id="unityResultCard">
        <header>
          <div class="uc-result-top"><span class="uc-caption">空中回廊 <span>/ RESULT</span></span><span id="unityResultDifficulty"></span></div>
          <div class="uc-result-heading"><div><h2 id="unityResultTitle"></h2><p id="unityEscapeRecord"></p></div><p id="unityResultGoal"></p></div>
        </header>
        <div id="unityResultContent">
          <section class="uc-points" aria-label="合計スコア">
            <p class="uc-total-label">合計スコア</p>
            <div class="uc-total"><b id="unityResultTotal">0</b><small>pt</small></div>
            <span id="unityResultBest"></span>
            <p class="uc-score-help">生存時間と戦闘の得点に難易度倍率を反映済み。各得点の端数は切り捨て。表示秒数は概数。</p>
          </section>
          <section class="uc-ledger" aria-label="スコア内訳">
            <div class="uc-ledger-heading"><h3>スコア内訳</h3><span>難易度 <b id="unityResultBonus"></b></span></div>
            <div class="uc-breakdown">
              <div>${image('clock')}<div class="uc-entry"><div><span>生存点</span><small id="unitySurvivalMetric"></small></div><p id="unitySurvivalFormula"></p></div><b id="unityResultSurvival"></b></div>
              <div><span class="uc-damage-icon" aria-hidden="true">＋</span><div class="uc-entry"><span>ダメージ点</span><p id="unityDamageFormula"></p></div><b id="unityResultDamage"></b></div>
              <div>${image('skull')}<div class="uc-entry"><span>撃破点</span><p id="unityKillFormula"></p></div><b id="unityResultKill"></b></div>
              <div id="unityParkourRow" hidden><span class="uc-damage-icon" aria-hidden="true">×</span><div class="uc-entry"><span>パルクールクリア</span><p id="unityParkourFormula"></p></div><b id="unityResultParkour"></b></div>
            </div>
            <p id="unityResultEquation" class="uc-equation" aria-label="内訳の合計"></p>
          </section>
        </div>
        <footer id="unityResultActions"><button id="unityRetry" type="button">もう一度逃げる</button><button id="unityMenu" type="button">ホームへ</button><button id="unityMore" type="button">ランキング・記録</button></footer>
      </article>
      <section id="unityScoreDetails" hidden><h2>ランキング・プレイの記録</h2><p id="unityRunDetails"></p><p id="unityRunMoves"></p><div id="unityScoreRanking"></div><p id="unityRecordStatus"></p><button id="unityDetailsBack" type="button">リザルトに戻る</button></section>`;
    $('ovOver').append(result);
    const perf = document.createElement('div'); perf.id = 'unityAdvicePerf'; perf.hidden = true; perf.setAttribute('role', 'group'); perf.setAttribute('aria-label', '動作の案内');
    perf.innerHTML = '<p>動作が重いようです。描画を軽くしますか？</p><div><button id="unityAdviceLight" type="button">軽量にする</button><button id="unityAdviceKeep" type="button">そのままにする</button></div>';
    $('unityResultActions').before(perf);
    for (const [id, accept] of [['unityAdviceLight', true], ['unityAdviceKeep', false]]) $(id).addEventListener('click', () => { window.skyFoundation?.answerQualityAdvice?.(accept); perf.hidden = true; });
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
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && playing()) window.__game.setMode('pause');
    });
    window.addEventListener('keydown', e => {
      if (enabled() && game.modeRef() === 'over' && performance.now() < readyAt && ['KeyR', 'Enter', 'Space'].includes(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    fit(); sync();
  }
  window.skyChallengeScore = { enabled, level, evaluate, current, reset, sync, attach, showResult, step, damaged,
    pursuit: () => tracker?.snapshot(), feedbackRequired: true, feedbackState: () => fx?.snapshot(),
    freeze() { fx?.setActive(false); return frozen ||= Object.freeze({ ...current() }); },
    killed() { if (playing()) { feedback(false); sync(); pulse('unityKills', 1.2); } },
  };
})();
