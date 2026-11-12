// Presentation port of InfectionFeedbackHud / ApprovedGameplayHud. No score is
// awarded here: confirmed damage, kills and escape events arrive from the game.
(() => {
  const base = './assets/combat-feedback/';
  const sounds = { hit: ['Hit', .22, .12], kill: ['Kill', .42, .08],
    arrival: ['DamageArrival', .13, .18], medal: ['Medal', .075, .16],
    milestone: ['Milestone', .42, .3], escape: ['Bonus', .32, .4],
    tick: ['Medal', .16, .5] };
  const assets = window.skyCombatFeedbackAssets = { phase: 'loading', error: '', buffers: {} };
  const announce = () => { document.body.dataset.skyFeedbackAssets = assets.phase; window.skyStartReadiness?.sync(); };
  assets.ready = (async () => {
    try {
      const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const decoder = new Offline(1, 1, 44100);
      await Promise.all([
        ...Object.entries(sounds).map(async ([key, [name]]) => {
          const response = await fetch(base + name + '.flac');
          if (!response.ok) throw Error(name + ': HTTP ' + response.status);
          assets.buffers[key] = await decoder.decodeAudioData(await response.arrayBuffer());
        }),
        ...['damage-bullet.png', 'skull.png', 'titanium.png', 'gold.png', 'socket.png', 'escaped.svg'].map(name =>
          new Promise((resolve, reject) => { const img = new Image(); img.onload = resolve; img.onerror = () => reject(Error(name)); img.src = base + name; })),
        (async () => { const font = new FontFace('SkyFeedback', `url(${base}feedback-medium.woff)`); await font.load(); document.fonts.add(font); })(),
      ]);
      assets.phase = 'ready';
    } catch (error) { assets.phase = 'error'; assets.error = String(error.message || error); }
    announce(); return assets;
  })();
  announce();

  window.createSkyCombatFeedback = (game, isPlaying) => {
    const root = document.createElement('div'); root.id = 'combatFeedback'; root.hidden = true; root.setAttribute('aria-hidden', 'true');
    const art = (name, cls = '') => `<img class="${cls}" src="${base + name}" alt="" draggable="false">`;
    root.innerHTML = `<svg class="cf-trails" aria-hidden="true"><g></g></svg>
      <div id="threatHit" class="cf-damage" hidden>${art('damage-bullet.png')}<span><b></b><small>DMG</small><em></em></span></div>
      <div id="damageStack" class="cf-stack" hidden><div class="cf-chips">${Array.from({length: 5}, () => `<span>${art('socket.png')}<i>${art('titanium.png')}</i></span>`).join('')}</div><span class="cf-damage-total">0 / 10 DMG</span></div>
      <div id="damageAward" class="cf-award" hidden>${art('gold.png')}<span><b>10 DMG</b><small>ダメージ達成</small></span></div>
      <div id="threatFeedback" class="cf-event" hidden>${art('skull.png', 'cf-event-icon')}<span><b class="cf-event-caption"></b><strong class="cf-event-title"></strong><small class="cf-event-detail"></small></span><i class="cf-event-line"></i></div>`;
    document.getElementById('hud').append(root);
    const $ = sel => root.querySelector(sel), hit = $('#threatHit'), toast = $('#threatFeedback');
    const stack = $('#damageStack'), award = $('#damageAward'), trailGroup = $('.cf-trails g');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const format = n => Number(n.toFixed(1)).toLocaleString('en-US');
    const tr = s => window.skyI18n?.tr(s) || s;
    const now = () => game.z.t;
    let visible = false, pending = null, hitAt = -Infinity, toastAt = -Infinity, toastDuration = 0;
    let killCount = 0, killPoints = 0, lastKill = -Infinity, lastDamage = -Infinity;
    let totalDamage = 0, arrived = 0, presented = 0, medals = 0, fullAt = -Infinity, awardAt = -Infinity, lastPaint = -Infinity;
    let generation = 0, hitHook, killHook;
    const voices = new Set(), lastSound = {}, history = [], counts = { flights: 0, arrivals: 0, kills: 0, escapes: 0, ticks: 0 };
    const flights = Array.from({ length: 12 }, () => {
      const node = document.createElement('div'); node.className = 'cf-flight'; node.hidden = true;
      node.innerHTML = `${art('damage-bullet.png')}<span><b></b><small>DMG</small><em></em></span>`; root.append(node);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); trailGroup.append(path);
      return { node, path, active: false, damage: 0, points: 0, at: 0, origin: null, destination: null };
    });
    function sound(key) {
      const ctx = game.Ut?.ctx, master = game.Ut?.master, buffer = assets.buffers[key];
      const at = now(), config = sounds[key];
      if (!visible || !isPlaying() || document.hidden || !ctx || ctx.state !== 'running' || !master || !buffer || game.U.volume <= 0 || master.gain.value <= 0) return;
      if (at - (lastSound[key] ?? -Infinity) < config[2]) return;
      const same = [...voices].filter(v => v.key === key);
      if (same.length >= 2 || voices.size >= 8) return;
      const source = ctx.createBufferSource(), gain = ctx.createGain(); source.buffer = buffer;
      gain.gain.value = config[1]; source.connect(gain); gain.connect(master);
      const voice = { key, source, gain }; voices.add(voice); lastSound[key] = at;
      source.onended = () => { voices.delete(voice); source.disconnect(); gain.disconnect(); };
      source.start(); history.push({ key, time: at, generation }); if (history.length > 40) history.shift();
    }
    function stopSounds() { for (const v of voices) { try { v.source.stop(); } catch {} } voices.clear(); }
    function installAudio() {
      // Extensions install the original sounds before start readiness succeeds.
      // The native hit/kill callbacks remain intact in non-scored modes.
      if (game.Tt.hit !== hitHook) { const original = game.Tt.hit; hitHook = (...args) => { if (!isPlaying()) original?.(...args); }; game.Tt.hit = hitHook; }
      if (game.Tt.kill !== killHook) { const original = game.Tt.kill; killHook = (...args) => { if (!isPlaying()) original?.(...args); }; game.Tt.kill = killHook; }
    }
    function settle(f) {
      arrived += f.damage; counts.arrivals++; f.active = false; f.node.hidden = true; f.path.setAttribute('d', '');
      if (f.points > 0) {
        sound('arrival');
        const score = document.getElementById('unityTotal');
        if (!reduced) { score.getAnimations().forEach(a => a.cancel()); score.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: 180 }); }
      }
    }
    function clear(resetProgress = false) {
      pending = null; hit.hidden = toast.hidden = award.hidden = true; hitAt = toastAt = awardAt = -Infinity; stopSounds();
      for (const f of flights) { f.active = false; f.node.hidden = true; f.path.setAttribute('d', ''); }
      if (resetProgress) {
        totalDamage = arrived = presented = medals = 0; fullAt = -Infinity; stack.hidden = true;
        killCount = killPoints = 0; lastKill = lastDamage = -Infinity;
        Object.keys(counts).forEach(k => counts[k] = 0); history.length = 0; Object.keys(lastSound).forEach(k => delete lastSound[k]);
      } else { presented = arrived = totalDamage; medals = Math.floor(arrived / 10); fullAt = -Infinity; stack.hidden = true; }
      lastPaint = -Infinity;
    }
    const layout = () => {
      root.classList.toggle('cf-compact', root.clientHeight <= 500);
      root.classList.toggle('cf-narrow', root.clientWidth <= 660);
    };
    function setActive(active) {
      active = !!active && !document.hidden;
      if (visible === active) return;
      if (visible && !active) clear(false);
      visible = active; root.hidden = !active; if (active) layout();
    }
    function reset() { clear(true); generation++; installAudio(); setActive(isPlaying()); }
    function originFor(pos) {
      let x = root.clientWidth / 2 + 40, y = root.clientHeight / 2 - 16;
      if (pos && game.Geom?.Vector3) {
        const p = new game.Geom.Vector3(pos.x, pos.y + 1.1, pos.z).project(game.Se);
        if (p.z > -1 && p.z < 1 && Math.abs(p.x) < .95 && Math.abs(p.y) < .9) { x = (p.x + 1) * root.clientWidth / 2 + 20; y = (1 - p.y) * root.clientHeight / 2 - 20; }
      }
      return { x: Math.max(80, Math.min(root.clientWidth - 100, x)), y: Math.max(110, Math.min(root.clientHeight - 110, y)) };
    }
    function damage(amount, points, pos) {
      if (!visible || !isPlaying() || !(amount > 0)) return;
      const at = now(), origin = originFor(pos); lastDamage = at; totalDamage += amount;
      if (!pending) pending = { damage: 0, points: 0, x: 0, y: 0, at };
      pending.damage += amount; pending.points += points; pending.x += origin.x * amount; pending.y += origin.y * amount;
      const p = { x: pending.x / pending.damage, y: pending.y / pending.damage };
      hit.querySelector('b').textContent = '+' + format(pending.damage); hit.querySelector('em').textContent = pending.points ? '+' + pending.points + ' pt' : '';
      hit.style.left = p.x + 'px'; hit.style.top = p.y + 'px'; hit.hidden = false; hitAt = at;
      sound('hit');
    }
    function launch() {
      let f = flights.find(f => !f.active);
      if (!f) { f = flights.reduce((a, b) => a.at < b.at ? a : b); settle(f); }
      const p = pending; pending = null;
      f.damage = p.damage; f.points = p.points; f.at = now(); f.active = true; counts.flights++;
      f.origin = { x: p.x / p.damage, y: p.y / p.damage };
      stack.hidden = false;
      f.destination = { x: root.clientWidth / 2, y: parseFloat(getComputedStyle(root).getPropertyValue('--cf-stack-top')) + 25 };
      // Local offsets also work when the logical game viewport is rotated.
      if (stack.offsetWidth) f.destination = { x: stack.offsetLeft + stack.offsetWidth / 2, y: stack.offsetTop + stack.offsetHeight / 2 };
      f.control = { x: (f.origin.x + f.destination.x) / 2 + 55, y: Math.min(f.origin.y, f.destination.y) - 35 };
      f.node.querySelector('b').textContent = '+' + format(f.damage); f.node.querySelector('em').textContent = f.points ? '+' + f.points + ' pt' : '';
      f.node.hidden = false; hit.hidden = true;
    }
    function event(escape, points = 0) {
      if (!visible || !isPlaying()) return;
      const at = now();
      if (!escape) { if (at - lastKill > .12) killCount = killPoints = 0; killCount++; killPoints += points; lastKill = at; counts.kills++; }
      else counts.escapes++;
      toast.dataset.kind = escape ? 'escape' : 'kill'; toast.querySelector('img').src = base + (escape ? 'escaped.svg' : 'skull.png');
      toast.querySelector('.cf-event-caption').textContent = escape ? 'ESCAPED' : 'KILL' + (killCount > 1 ? ' ×' + killCount : '');
      toast.querySelector('.cf-event-title').textContent = tr(escape ? '追手を撒いた' : 'ゾンビ撃破');
      toast.querySelector('.cf-event-detail').textContent = escape ? '' : '+' + killPoints + ' pt';
      toast.hidden = false; toastAt = at; toastDuration = escape ? 1.5 : 1.05;
      sound(escape ? 'escape' : 'kill');
    }
    function paintEvent(at) {
      const age = at - toastAt;
      if (age >= toastDuration || age < 0) { toast.hidden = true; return; }
      const scale = reduced ? 1 : age < .12 ? .9 + age / .12 * .135 : 1.035 - Math.min(1, (age - .12) / .12) * .035;
      toast.style.opacity = Math.min(age / .07, (toastDuration - age) / .22, 1);
      toast.style.transform = `translateY(${reduced ? 0 : Math.max(0, age / toastDuration - .75) * -15}px) scale(${scale})`;
    }
    function step(dt) {
      if (!visible || !isPlaying()) return;
      const at = now();
      if (!pending && !flights.some(f => f.active) && at - toastAt >= toastDuration && at - awardAt >= 1.2 && (arrived <= 0 || at - lastDamage > 4)) {
        hit.hidden = toast.hidden = award.hidden = stack.hidden = true; return;
      }
      if (pending && at - pending.at >= .12) launch();
      if (at - lastPaint < 1 / 60 - .0001) return;
      const span = Number.isFinite(lastPaint) ? Math.min(.25, at - lastPaint) : Math.max(.008, dt); lastPaint = at;
      if (!hit.hidden) { const age = at - hitAt; hit.style.opacity = Math.min(1, age / .025); hit.style.transform = `translate(-50%,-50%) scale(${reduced ? 1 : 1 + .1 * Math.sin(Math.min(1, age / .12) * Math.PI)})`; }
      for (const f of flights) if (f.active) {
        const age = at - f.at, u = Math.min(1, age / .36), e = u * u * (3 - 2 * u), r = 1 - e;
        const x = reduced ? f.origin.x : r * r * f.origin.x + 2 * r * e * f.control.x + e * e * f.destination.x;
        const y = reduced ? f.origin.y : r * r * f.origin.y + 2 * r * e * f.control.y + e * e * f.destination.y;
        f.node.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) scale(${reduced ? 1 : 1 - e * .5})`;
        f.node.style.opacity = Math.min(age / .045, (.4 - age) / .08, 1);
        if (!reduced) f.path.setAttribute('d', `M${f.destination.x},${f.destination.y} Q${f.control.x * r + f.destination.x * e},${f.control.y * r + f.destination.y * e} ${x},${y}`);
        if (age >= .36) settle(f);
      }
      const awarding = at - awardAt < 1.2;
      if (!awarding) {
        const ceiling = (medals + 1) * 10, target = Math.min(arrived, ceiling);
        presented = Math.min(target, presented + Math.max(20, (target - presented) * 10) * span);
        if (presented + .00001 >= ceiling) {
          if (!Number.isFinite(fullAt)) fullAt = at;
          if (at - fullAt >= .3) { medals++; fullAt = -Infinity; awardAt = at; sound('milestone'); }
        }
      }
      const remainder = Math.max(0, presented - medals * 10), activeFlights = flights.some(f => f.active);
      stack.hidden = at - awardAt < 1.2 || (at - lastDamage > 4 && !activeFlights) || !(remainder > 0 || activeFlights);
      const label = format(remainder) + ' / 10 DMG', counter = $('.cf-damage-total');
      if (counter.textContent !== label) counter.textContent = label;
      [...root.querySelectorAll('.cf-chips>span')].forEach((chip, i) => {
        const fill = Math.max(0, Math.min(1, (remainder - i * 2) / 2));
        const clip = `inset(0 ${(100 - fill * 100).toFixed(2)}% 0 0)`;
        if (chip.dataset.fill !== clip) { chip.querySelector('i').style.clipPath = clip; chip.dataset.fill = clip; }
        if (fill >= 1 && chip.dataset.full !== 'true') { chip.dataset.full = 'true'; sound('medal'); }
        else if (fill < 1) chip.dataset.full = 'false';
      });
      award.hidden = at - awardAt >= 1.2;
      if (!award.hidden) { const age = at - awardAt; award.style.opacity = Math.min(age / .07, (1.2 - age) / .22, 1); award.style.transform = `scale(${reduced ? 1 : 1 + .06 * Math.sin(Math.min(1, age / .24) * Math.PI)})`; }
      if (!toast.hidden) paintEvent(at);
    }
    document.addEventListener('visibilitychange', () => { if (document.hidden) { setActive(false); } });
    window.addEventListener('resize', () => { clear(false); requestAnimationFrame(layout); });
    // Survival milestone (every few seconds); the points themselves come from the score module.
    function tick(major) { if (!visible || !isPlaying()) return; counts.ticks++; sound(major ? 'milestone' : 'tick'); }
    return { reset, setActive, step, damage, tick, kill: points => event(false, points), escaped: () => event(true),
      snapshot: () => ({ ...counts, activeFlights: flights.filter(f => f.active).length, arrivedDamage: arrived, presentedDamage: presented,
        totalDamage, milestones: medals, pendingDamage: pending?.damage || 0, sounds: history.map(e => ({ ...e })), activeVoices: voices.size,
        generation, visible, reducedMotion: reduced, phase: assets.phase }) };
  };
})();
