// Threat survival owns points; HUD, hit, kill and escape cues only present them.
(() => {
  const ids = ['easy', 'normal', 'hard'];
  const assets = './assets/challenge-score/';
  let game, frozen, previousMinute = -1, animation = 0, readyAt = 0, lastResult;
  let tracker, hudKey = '', threatKey = '', pauseKey = '', hitAt = -Infinity, hitDamage = 0;
  let hitUntil = 0, feedbackUntil = 0;
  const $ = id => document.getElementById(id);
  const enabled = () => !!window.skyChallenge?.profile();
  const level = () => Math.max(0, ids.indexOf(window.skyChallenge.id));
  const evaluate = (...args) => window.skyThreatScore.evaluate(...args);
  const playing = () => game && enabled() && !game.z.over && !game.z.mission &&
    !window.skyPracticeMode && !game.demoActive?.() && game.modeRef() === 'play';
  function current() {
    if (frozen) return frozen;
    return evaluate(Math.min(window.__game.RUN_LEN, game.z.t), window.__game.stats.kills || 0,
      level(), tracker?.snapshot());
  }
  function cue(escape) {
    const ctx = game.Ut?.ctx, master = game.Ut?.master;
    if (!ctx || ctx.state !== 'running' || !master) return;
    const notes = escape ? [660, 990, 1320] : [880, 1320];
    notes.forEach((hz, i) => {
      const at = ctx.currentTime + i * .065, oscillator = ctx.createOscillator(), gain = ctx.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = hz;
      gain.gain.setValueAtTime(.0001, at); gain.gain.exponentialRampToValueAtTime(.065, at + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, at + .17);
      oscillator.connect(gain); gain.connect(master); oscillator.start(at); oscillator.stop(at + .19);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  }
  function feedback(escape) {
    if (!playing()) return;
    const e = $('threatFeedback'); if (!e) return;
    e.dataset.kind = escape ? 'escape' : 'kill';
    e.textContent = escape ? 'ESCAPED · 追手を引き離した' :
      `KILL +${Math.round(100 * (1 + level() * .1))}`;
    e.hidden = false; feedbackUntil = game.z.t + (escape ? 1.4 : .75);
    cue(escape);
  }
  function step(dt) {
    if (!playing() || document.hidden) return;
    tracker?.step(dt);
    if ($('threatHit')) $('threatHit').hidden = game.z.t >= hitUntil;
    if ($('threatFeedback')) $('threatFeedback').hidden = game.z.t >= feedbackUntil;
  }
  function damaged(amount) {
    if (!playing() || !Number.isFinite(amount) || amount <= 0) return;
    tracker?.damaged(amount); hitDamage += amount;
    if (game.z.t - hitAt < .07) return;
    hitAt = game.z.t; hitUntil = game.z.t + .22;
    const e = $('threatHit'); if (!e) return;
    e.textContent = `HIT ${Math.round(hitDamage * 10) / 10}`; e.hidden = false; hitDamage = 0;
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
    tracker = window.skyThreatScore.createTracker(game, window.__game, () => feedback(true));
    hudKey = threatKey = pauseKey = ''; hitDamage = 0; hitAt = -Infinity; hitUntil = feedbackUntil = 0;
    for (const id of ['threatHit', 'threatFeedback']) if ($(id)) $(id).hidden = true;
    if ($('unityScoreDetails')) $('unityScoreDetails').hidden = true;
    sync();
  }
  function sync() {
    document.body.classList.toggle('unity-challenge-score', enabled());
    if (!game || !enabled()) return;
    const b = current(), mode = game.modeRef();
    const active = mode === 'play' && !game.z.over;
    $('unityScoreHud').hidden = !active;
    $('threatScoreHud').hidden = !active;
    if (!active) for (const id of ['threatHit', 'threatFeedback']) $(id).hidden = true;
    const remaining = Math.max(0, window.__game.RUN_LEN - b.elapsed).toFixed(0);
    const threat = tracker?.snapshot() || {};
    const timeFactor = Math.round((threat.rate || 0) * b.difficulty), killFactor = Math.round(100 * b.difficulty);
    const nextThreatKey = `${threat.count}|${threat.pressure}|${timeFactor}|${threat.repetition < .05}`;
    if (nextThreatKey !== threatKey) {
      threatKey = nextThreatKey;
    set('threatStatus', `${threat.count || 0}体 · 脅威 ${Number(threat.pressure || 0).toFixed(1)}/3`);
    set('threatRate', `+${timeFactor}点/秒`);
    set('threatHint', !threat.count ? '追手を引き離している' : threat.repetition < .05 ? '同じ場所での加点上限' : timeFactor < 1 ? '移動して追跡をしのごう' : '追跡をしのいで加点中');
    }
    const key = `${window.skyChallenge.id}|${remaining}|${timeFactor}|${killFactor}|${b.kills}|${b.total}`;
    if (key !== hudKey) {
      hudKey = key;
      set('unityDifficulty', window.skyChallenge.name); set('unityTime', remaining);
      set('unityKills', b.kills); set('unityTotal', b.total.toLocaleString('ja-JP'));
      set('unityTimeFactor', '+' + timeFactor + '/秒'); set('unityKillFactor', killFactor + '点/体');
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
      set('unityPauseSurvival', `逃走 ${b.chasedSeconds.toFixed(1)}秒（脅威度を加味） → ${b.survival}点`);
      set('unityPauseKill', `撃破 ${b.kills}体 → ${b.kill}点 ／ ダメージ ${b.damageUnits.toFixed(1)} → ${b.damage}点`);
      set('unityPauseTotal', `合計 ${b.total}点`);
    }
  }
  function fit() {
    $('unityResultCard').dataset.compact = String($('app').clientHeight < 500);
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
    set('unityResultGoal', failed ? '追跡をしのいだ得点と戦闘得点で、全難易度のプレイヤーと競おう。' : '2分間のスコアで、全難易度のプレイヤーと競おう。');
    set('unityEscapeRecord', `${b.elapsed.toFixed(1)} / ${window.__game.RUN_LEN}秒 ・ ${failed ? '未クリア' : window.skyChallenge.name + ' クリア'}`);
    set('unityRunMoves', `フック ${window.__game.stats.hooks || 0}　壁走り ${window.__game.stats.wallruns || 0}　乗り越え ${window.__game.stats.vaults || 0}　落下 ${window.__game.stats.falls || 0}`);
    set('unityResultDifficulty', `難易度　${window.skyChallenge.name}`);
    set('unityResultBonus', bonus(b));
    set('unityResultSurvival', b.survival.toLocaleString('ja-JP') + ' pt');
    set('unityResultKill', b.kill.toLocaleString('ja-JP') + ' pt');
    set('unitySurvivalFormula', `追跡 ${b.chasedSeconds.toFixed(1)}秒 · 脅威度・移動・周回を反映`);
    set('unityResultDamage', b.damage.toLocaleString('ja-JP') + ' pt');
    set('unityDamageFormula', `有効ダメージ ${b.damageUnits.toFixed(1)} ×${(2 * b.difficulty).toFixed(1)}`);
    set('unityKillFormula', `${b.kills}体 ×${Math.round(100 * b.difficulty)}`);
    set('unityResultEquation', `${b.survival} + ${b.damage} + ${b.kill} = ${b.total}点`);
    set('unityResultBest', best ? 'スコアベスト更新' : '今回のスコア');
    set('unityRunDetails', `生存 ${b.elapsed.toFixed(1)}秒 / 撃破 ${b.kills}体（落下撃破 ${window.__game.stats.drops}体）`);
    if (intro) {
      set('unityResultTitle', '入門モード、おつかれさま！');
      set('unityResultGoal', '次はイージー・ノーマル・ハードから選んで挑戦できます。');
      set('unityEscapeRecord', 'ライフ無限の入門体験 · ランキング対象外');
      set('unityResultBest', 'この入門の記録は保存・送信しません');
    }
    $('unityScoreDetails').hidden = true;
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
    hud.innerHTML = `<div id="unityDifficulty"></div><div class="unity-counter">${image('clock')}<b id="unityTime">120</b><small>秒</small><span>逃走 <strong id="unityTimeFactor">+0/秒</strong></span></div><div class="unity-counter">${image('skull')}<b id="unityKills">0</b><small>撃破</small><span>撃破 <strong id="unityKillFactor">100点/体</strong></span></div><div class="unity-counter unity-score"><b id="unityTotal">0</b><small>点</small><span>SCORE</span></div>`;
    $('hud').append(hud);
    const threatHud = document.createElement('div'); threatHud.id = 'threatScoreHud';
    threatHud.innerHTML = '<b id="threatStatus"></b><strong id="threatRate"></strong><small id="threatHint"></small>';
    $('hud').append(threatHud);
    for (const id of ['threatHit', 'threatFeedback']) {
      const node = document.createElement('div'); node.id = id; node.hidden = true;
      node.setAttribute('aria-hidden', 'true'); $('hud').append(node);
    }
    // Difficulty belongs with the other status lines, not floating under the header (it collided with hints).
    $('hud').querySelector('.hud-tl')?.prepend($('unityDifficulty'));
    const pause = document.createElement('aside'); pause.id = 'unityScorePause';
    pause.innerHTML = `<h3>得点の内訳</h3><p id="unityPauseIdentity"></p><p id="unityPauseSurvival"></p><p id="unityPauseKill"></p><b id="unityPauseTotal"></b><small>近くの追手から移動して逃げるほど加点。同じ場所の周回・安全な待機は加点が減ります。技とESCAPED自体の加点はありません。難易度ボーナスは反映済み。</small>`;
    $('challengeSettingsNote').after(pause);
    const result = document.createElement('div'); result.id = 'unityScoreResult';
    result.innerHTML = `<article id="unityResultCard"><header><span class="uc-caption">空中回廊 / 逃走の記録</span><span id="unityResultDifficulty"></span><h2 id="unityResultTitle"></h2></header><div id="unityResultContent"><section class="uc-points"><span id="unityResultBest"></span><div class="uc-total"><b id="unityResultTotal">0</b><small> pt</small></div><div class="uc-breakdown"><div><span>逃走</span><b id="unityResultSurvival"></b><small id="unitySurvivalFormula"></small></div><div><span>ダメージ</span><b id="unityResultDamage"></b><small id="unityDamageFormula"></small></div><div><span>撃破</span><b id="unityResultKill"></b><small id="unityKillFormula"></small></div></div><small id="unityResultBonus"></small><small id="unityResultEquation"></small></section><section class="uc-achievement"><p id="unityEscapeRecord"></p><p id="unityResultGoal"></p></section><p id="unityRunMoves"></p></div><footer id="unityResultActions"><button id="unityRetry" type="button">もう一度逃げる</button><button id="unityMore" type="button">ランキング・記録</button><button id="unityMenu" type="button">メニュー</button></footer></article><section id="unityScoreDetails" hidden><h2>ランキング・プレイの記録</h2><p id="unityRunDetails"></p><div id="unityScoreRanking"></div><p id="unityRecordStatus"></p><button id="unityDetailsBack" type="button">リザルトに戻る</button></section>`;
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
  window.skyChallengeScore = { enabled, level, evaluate, current, reset, sync, attach, showResult, step, damaged,
    threat: () => tracker?.snapshot(),
    freeze() { return frozen ||= Object.freeze({ ...current() }); },
    killed() { if (playing()) { feedback(false); sync(); pulse('unityKills', 1.2); } },
  };
})();
