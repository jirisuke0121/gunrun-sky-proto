// First-run guidance after the intro run. Three one-time lights, nothing else:
//   1. the first real run starts  -> the 2:00 clock is lit up: "survive for 2 minutes" is the mission;
//   2. the home screen after that run -> the score multipliers (Easy x1.0 / Normal x1.1 / Hard x1.2) are lit up:
//      the harder the difficulty, the bigger the score bonus (and Normal is the natural next step);
//   3. a first-time player who goes home after the intro run without pressing 本番イージー finds Easy preselected.
// Each light is shown once and remembered; a returning player (anyone who was not shown the first-visit card) never sees
// them. It reads game state only: it changes no rule, score or ranking input.
(() => {
  const params = new URLSearchParams(location.search);
  const $ = id => document.getElementById(id);
  const STORE = 'gunrun-first-run-guide-v1', DIFFICULTY = 'gunrun-challenge-difficulty-v1';
  if (params.get('onboarding') === 'reset') { try { localStorage.removeItem(STORE); } catch { /* storage unavailable */ } }
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } };
  let state;
  try { state = JSON.parse(read(STORE) || 'null'); } catch { state = null; }
  if (!state) {
    // Only someone who got the first-visit card (onboarding.js) is a first-time player; everyone else is marked as done.
    // ?firstGuide=1 forces the guide (automated browsers never get the first-visit card on their own).
    const fresh = window.skyOnboarding?.first === true || params.get('firstGuide') === '1';
    state = fresh ? {} : { mission: 1, bonus: 1, easy: 1 };
    write(STORE, JSON.stringify(state));
  }
  const save = patch => { Object.assign(state, patch); write(STORE, JSON.stringify(state)); };
  const finished = () => state.mission && state.bonus;
  const make = (tag, props = {}, html = '') => Object.assign(document.createElement(tag), props, html ? { innerHTML: html } : {});

  let layer = null, current = null, raf = 0, timer = 0;
  const NS = 'http://www.w3.org/2000/svg';
  // Dim everything except the lit rectangles (even-odd cut-outs), plus a glowing ring around each one.
  function paint() {
    if (!layer || !current) return;
    const app = $('app'), box = app.getBoundingClientRect();
    const rects = current.targets().map(el => el.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0)
      .map(r => ({ x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height }));
    const pad = 6, W = box.width, H = box.height;
    let d = `M0 0H${W}V${H}H0Z`;
    layer.querySelectorAll('.fg-ring').forEach(el => el.remove());
    for (const r of rects) {
      const x = r.x - pad, y = r.y - pad, w = r.w + pad * 2, h = r.h + pad * 2, k = 10;
      d += `M${x + k} ${y}H${x + w - k}Q${x + w} ${y} ${x + w} ${y + k}V${y + h - k}Q${x + w} ${y + h} ${x + w - k} ${y + h}H${x + k}Q${x} ${y + h} ${x} ${y + h - k}V${y + k}Q${x} ${y} ${x + k} ${y}Z`;
      layer.append(make('i', { className: 'fg-ring' })); const ring = layer.lastChild;
      Object.assign(ring.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    }
    layer.querySelector('path').setAttribute('d', d);
    layer.querySelector('path').setAttribute('fill-rule', 'evenodd');
    layer.querySelector('svg').setAttribute('viewBox', `0 0 ${W} ${H}`);
    // The card sits on whichever side of the lit area has more room.
    const card = layer.querySelector('.fg-card');
    if (rects.length) {
      // Keep clear of the whole block the lit numbers belong to (e.g. the three difficulty buttons), not just the numbers.
      const block = current.avoid?.()?.getBoundingClientRect(), keep = block && block.width > 0
        ? [{ y: block.top - box.top, h: block.height }] : rects;
      const top = Math.min(...keep.map(r => r.y)), bottom = Math.max(...keep.map(r => r.y + r.h));
      const above = top, below = H - bottom;
      const place = current.place === 'below' || (current.place !== 'above' && below >= above) ? 'below' : 'above';
      card.dataset.side = place;
      card.style.top = place === 'below' ? Math.min(H - card.offsetHeight - 6, bottom + pad + 10) + 'px' : Math.max(6, top - pad - 10 - card.offsetHeight) + 'px';
    }
    raf = requestAnimationFrame(paint);
  }
  function hide() {
    cancelAnimationFrame(raf); clearTimeout(timer);
    layer?.remove(); layer = null;
    const done = current; current = null;
    document.body.classList.remove('first-guide-open');
    done?.after?.();
  }
  function show(spec) {
    if (current) return false;
    current = spec;
    layer = make('div', { id: 'firstRunGuide' });
    layer.dataset.kind = spec.kind;
    layer.setAttribute('role', spec.blocking ? 'dialog' : 'status');
    if (spec.blocking) layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-labelledby', 'fgTitle');
    layer.innerHTML = `<svg aria-hidden="true"><path fill="#030c14"/></svg><div class="fg-card"><h2 id="fgTitle"></h2><p></p>${spec.blocking ? '<button type="button" class="fg-ok">わかった</button>' : ''}</div>`;
    layer.querySelector('h2').textContent = spec.title;
    layer.querySelector('p').textContent = spec.body;
    ($('app') || document.body).append(layer);
    document.body.classList.add('first-guide-open');
    if (spec.blocking) {
      layer.addEventListener('click', hide);
      layer.querySelector('.fg-ok').focus({ preventScroll: true });
      layer.addEventListener('keydown', event => { if (['Escape', 'Enter', ' '].includes(event.key)) { event.preventDefault(); hide(); } });
    }
    if (spec.ms) timer = setTimeout(hide, spec.ms);
    paint();
    return true;
  }

  // ---- 1. The first real run: light up the clock ----
  const clock = () => document.querySelector('#unityScoreHud .unity-counter');
  const missionSpec = () => ({
    kind: 'mission', blocking: false, ms: 5500, place: 'below',
    title: 'ミッション：2分間、生き残れ！', body: '時間いっぱい逃げ切ればクリア。',
    targets: () => [clock()].filter(Boolean),
    after: () => {},
  });

  // ---- 2. Home after the first real run: light up the score multipliers ----
  const multipliers = () => ['easy', 'normal', 'hard'].map(id => document.querySelector(`#homeDifficulty button[data-difficulty="${id}"] strong`)).filter(Boolean);
  const bonusSpec = () => ({
    kind: 'bonus', blocking: true, place: 'below',
    title: '難しいほど、スコアボーナスが高い', body: '慣れたらノーマルに挑戦して、高得点を狙おう。',
    targets: multipliers, avoid: () => document.querySelector('#homeDifficulty .home-difficulty-choices'),
    after: () => save({ bonus: 1 }),
  });

  // ---- 3. First-timer who went home after the intro run: Easy is preselected (once, and only if nothing was ever chosen) ----
  document.addEventListener('sky-intro-result', () => { if (!state.easy) save({ introDone: 1 }); });
  function preselectEasy() {
    const select = $('challengeDifficulty');
    save({ easy: 1 });
    if (!select || select.disabled || read(DIFFICULTY) || select.value === 'easy') return;
    select.value = 'easy'; select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function tick() {
    const g = window.__game, c = window.skyChallenge;
    if (!g || !c) return;
    const mode = g.mode, real = !c.isIntroRun && !g.z?.mission && !window.skyGuidedMode;
    if (current?.kind === 'mission' && mode !== 'play') hide();
    if (mode === 'play' && real && !current) {
      // The first real run of any difficulty (a first-timer normally gets here through 本番イージー).
      if (!state.mission && clock()?.getBoundingClientRect().width > 0) { save({ mission: 1, ran: 1 }); show(missionSpec()); }
      else if (!state.ran) save({ ran: 1 });
    }
    if (mode === 'menu' && !current && !$('ovStart')?.hidden && !window.skyOnboarding?.dialogVisible) {
      if (state.introDone && !state.ran && !state.easy) preselectEasy();
      if (state.ran && state.mission && !state.bonus && multipliers().length && !document.body.classList.contains('onb-open')) show(bonusSpec());
    }
    if (finished() && !current) { clearInterval(poll); poll = 0; }
  }
  let poll = finished() ? 0 : setInterval(tick, 250);
  window.skyFirstRunGuide = {
    get state() { return { ...state }; }, get visible() { return !!layer?.isConnected; }, get kind() { return current?.kind || null; },
    dismiss: hide, tick,
  };
})();
