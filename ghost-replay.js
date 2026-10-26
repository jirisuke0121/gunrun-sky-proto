import { formatReplayTime } from './replay-time.js?v=20261026-gear-polish-v1';
import { MAP_VERSIONS, REPLAY_LIMIT, REPLAY_STEP, REPLAY_STATES, sampleReplay, validateGhost } from './replay-data.js?v=20261026-feedback-v1';

export function createGhostReplay(game) {
  const { c, z, U, Geom, ue, Se: camera } = game;
  const map = window.SKY_CANYON_MAP ? 'rock-canyon' : 'old-town';
  const mapVersion = MAP_VERSIONS[map];
  const key = `gunrun-ranked-ghost-v1-${map}`;
  let samples = [], recording = false, best = null, showBest = true, active = null, fetchToken = 0;
  try { const data = JSON.parse(localStorage.getItem(key)); if (validateGhost(data?.ghost, map, 300)) best = data; } catch {}
  // Keep the previous browser-only best available after this upgrade.
  if (!best) try {
    const oldKey = map === 'rock-canyon' ? 'gunrun-sky-ghost-rock-canyon-v1' : 'gunrun-sky-ghost-v1';
    const old = JSON.parse(localStorage.getItem(oldKey));
    if (old?.total > 0 && Array.isArray(old.p) && old.p.length >= 8 && old.p.length <= REPLAY_LIMIT * 4 && old.p.length % 4 === 0) {
      const converted = [];
      for (let i = 0; i < old.p.length; i += 4) {
        const [x, y, z, yaw] = old.p.slice(i, i + 4), last = converted.at(-1);
        const cut = last && Math.hypot(x - last[1], y - last[2], z - last[3]) > 6 ? 1 : 0;
        converted.push([i / 4 * 0.1, x, y, z, yaw, 0, 0, 3, cut]);
      }
      const ghost = validateGhost({ v: 1, map, mapVersion, samples: converted }, map, 300);
      if (ghost) best = { total: old.total, cleared: false, ghost };
    }
  } catch {}
  const material = new Geom.Basic({ color: 0x7fd8ff, transparent: true, opacity: 0.65, depthWrite: false });
  const avatar = new Geom.Group();
  avatar.name = 'Recorded player ghost';
  const body = new Geom.Mesh(new Geom.Cylinder(0.22, 0.19, 0.95, 10), material);
  body.position.y = 0.9;
  const head = new Geom.Mesh(new Geom.Sphere(0.16, 10, 8), material);
  head.position.y = 1.55;
  const legs = [-0.12, 0.12].map(x => {
    const leg = new Geom.Mesh(new Geom.Cylinder(0.08, 0.07, 0.55, 8), material);
    leg.position.set(x, 0.28, 0); avatar.add(leg); return leg;
  });
  const nose = new Geom.Mesh(new Geom.Box(0.12, 0.1, 0.18), material);
  nose.position.set(0, 1.55, -0.15);
  avatar.add(body, head, nose); avatar.visible = false; ue.add(avatar);
  const style = document.createElement('style');
  style.textContent = `
body.sky-replaying #hud,body.sky-replaying #touch,body.sky-replaying #bSettings,body.sky-replaying #rotate{display:none!important}
#ghostReplay{position:fixed;inset:0;z-index:80;pointer-events:none;color:#fff;text-shadow:0 1px 3px #000;font:14px system-ui}
#ghostReplay[hidden]{display:none}#ghostReplay .replay-panel{pointer-events:auto;background:#191e25eb;padding:10px 14px;border-radius:12px;box-sizing:border-box}
#ghostReplay .replay-top{position:absolute;top:max(8px,env(safe-area-inset-top));left:8px;right:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
#replayDate{flex-basis:100%;margin:0;font-size:12px;color:#cad9e3}#ghostReplay h2{font-size:17px;margin:0;flex:1}#ghostReplay .replay-bottom{position:absolute;left:8px;right:8px;bottom:max(8px,env(safe-area-inset-bottom))}
#ghostReplay .replay-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}#ghostReplay button,#ghostReplay select{min-height:42px;font:600 14px system-ui;color:#fff;background:#344353;border:1px solid #8194a8;border-radius:7px;padding:7px 10px}
#ghostReplay input{width:100%;margin:8px 0;min-height:28px;touch-action:pan-x}#ghostReplay p{font-size:12px;margin:4px 0;line-height:1.45}#ghostReplay output{font-variant-numeric:tabular-nums}
#ghostBest{position:fixed;left:12px;bottom:56px;padding:3px 9px;border-radius:12px;background:#286e96a8;color:white;font:12px system-ui;pointer-events:none;z-index:6}
@media(max-width:600px){#ghostReplay .replay-panel{padding:7px 10px}#replayDate{flex-basis:100%;margin:0;font-size:12px;color:#cad9e3}#ghostReplay h2{font-size:14px}#ghostReplay .replay-controls{gap:5px}#ghostReplay button,#ghostReplay select{font-size:12px;padding:6px 8px}}
`;
  document.head.append(style);
  const chip = document.createElement('div'); chip.id = 'ghostBest'; chip.hidden = true; document.body.append(chip);
  const overlay = document.createElement('section');
  overlay.id = 'ghostReplay'; overlay.hidden = true; overlay.setAttribute('aria-label', 'ゴースト閲覧');
  overlay.innerHTML = `<div class="replay-panel replay-top"><h2 id="replayTitle">ゴースト</h2><button id="replayClose" type="button">ランキングに戻る</button><p id="replayDate"></p></div>
<div class="replay-panel replay-bottom"><p id="replayNote" role="status"></p><input id="replaySeek" aria-label="再生位置" type="range" min="0" max="1" step="0.01" value="0">
<div class="replay-controls"><button id="replayToggle" type="button">一時停止</button><button id="replayRestart" type="button">最初から</button><select id="replaySpeed" aria-label="再生速度"><option value="0.5">0.5倍速</option><option value="1" selected>1倍速</option><option value="2">2倍速</option></select><select id="replayView" aria-label="再生視点"><option value="follow">追従視点</option><option value="first">本人視点</option></select><output id="replayClock"></output></div></div>`;
  document.body.append(overlay);
  const el = id => overlay.querySelector('#' + id);
  const controls = ['replaySeek', 'replayToggle', 'replayRestart', 'replaySpeed', 'replayView'].map(el);
  const round = n => Math.round(n * 1000) / 1000;
  function capture(force = false) {
    if (!recording || z.mission || active || samples.length >= REPLAY_LIMIT) return;
    const t = round(z.t), last = samples.at(-1);
    if (last && (t <= last[0] || (!force && t - last[0] < REPLAY_STEP - 0.001))) return;
    const state = c.state === 'normal' ? (c.onGround ? 'run' : 'air') : c.state === 'ledge' ? c.ledge?.kind || 'vault' : c.state;
    const cut = last && (c.life < last[7] || Math.hypot(c.pos.x - last[1], c.pos.y - last[2], c.pos.z - last[3]) > 6) ? 1 : 0;
    samples.push([t, round(c.pos.x), round(c.pos.y), round(c.pos.z), round(c.yaw), round(c.pitch), Math.max(0, REPLAY_STATES.indexOf(state)), Math.max(0, c.life), cut]);
  }
  function start() { samples = []; recording = !z.mission; capture(true); }
  function snapshot() {
    if (z.mission || !recording) return null;
    capture(true);
    const ghost = validateGhost({ v: 1, map, mapVersion, samples }, map, z.t);
    return ghost ? { ...ghost, samples: ghost.samples.map(row => row.slice()) } : null;
  }
  function finish() {
    const ghost = snapshot();
    if (ghost && z.final && z.final.total > 0) {
      const cleared = z.reason === 'time';
      if (!best || Number(cleared) > Number(best.cleared) || (cleared === best.cleared && z.final.total > best.total)) {
        best = { total: z.final.total, cleared, ghost };
        try { localStorage.setItem(key, JSON.stringify(best)); } catch {}
      }
    }
    return ghost;
  }
  function poseAvatar(pose) {
    avatar.position.set(pose[1], pose[2], pose[3]); avatar.rotation.y = pose[4];
    const crouch = pose[6] === 2;
    avatar.scale.set(1, crouch ? 0.55 : 1, 1);
    const stride = pose[6] === 0 ? Math.sin(pose[0] * 12) * 0.45 : 0;
    legs[0].rotation.x = stride; legs[1].rotation.x = -stride;
  }
  function close() {
    ++fetchToken;
    if (!active) return;
    const saved = active.saved; active = null;
    document.body.classList.remove('sky-replaying'); window.dispatchEvent(new Event('resize')); overlay.hidden = true; avatar.visible = false;
    U.showBody = saved.showBody; game.U.volume = saved.volume; game.Ut.master?.gain.setValueAtTime(saved.volume, game.Ut.ctx.currentTime);
    c.pos.copy(saved.position); c.yaw = saved.yaw; c.pitch = saved.pitch;
    camera.fov = saved.fov; camera.updateProjectionMatrix();
    for (const [object, visible] of saved.visibility) object.visible = visible;
    game.An(saved.mode); saved.focus?.focus();
  }
  async function open(id, button) {
    if (!['menu', 'over'].includes(game.modeRef()) || active) return;
    const token = ++fetchToken;
    const visibility = game.Jt.flatMap(zombie => [zombie.m?.root, zombie.pool].filter(Boolean)).map(object => [object, object.visible]);
    active = { saved: { mode: game.modeRef(), showBody: U.showBody, volume: U.volume, position: c.pos.clone(), yaw: c.yaw, pitch: c.pitch, fov: camera.fov, visibility, focus: button }, ghost: null, time: 0, paused: false };
    game.An('replay'); document.exitPointerLock?.(); U.showBody = false;
    U.volume = 0; game.Ut.master?.gain.setValueAtTime(0, game.Ut.ctx.currentTime);
    for (const [object] of visibility) object.visible = false;
    chip.hidden = true; overlay.hidden = false; document.body.classList.add('sky-replaying'); window.dispatchEvent(new Event('resize'));
    el('replayNote').textContent = 'ゴーストを読み込み中…'; el('replayTitle').textContent = 'ゴースト';
    el('replayDate').textContent = ''; el('replayClock').textContent = ''; controls.forEach(control => { control.disabled = true; }); el('replayClose').focus();
    try {
      const response = await fetch(`https://gunrun-runs.jirisuke0121.workers.dev/ghosts/${encodeURIComponent(id)}?map=${map}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      if (token !== fetchToken || !active) return;
      if (data.ghost?.map !== map || (data.ghost.source !== 'legacy-trail' && !validateGhost(data.ghost, map, 300))) throw new Error('incompatible');
      if (!Array.isArray(data.ghost.samples) || data.ghost.samples.length < 2) throw new Error('empty');
      active.ghost = data.ghost; active.time = data.ghost.samples[0][0];
      el('replayTitle').textContent = `${data.tag} のゴースト · ${data.score}点`;
      el('replayDate').textContent = `記録 ${formatReplayTime(data.playedAt)}${data.playedAt ? '（日本時間）' : ''}`;
      el('replayNote').textContent = data.ghost.source === 'legacy-trail' ? '旧記録：1秒間隔の軌跡からの再生です。動き・向きは目安で、敵は再現しません。' : '記録した移動・視点を再生します。敵は再現しません。';
      el('replayView').querySelector('[value="first"]').disabled = data.ghost.source === 'legacy-trail';
      el('replayView').value = 'follow'; el('replaySpeed').value = '1';
      el('replaySeek').min = active.time; el('replaySeek').max = data.ghost.samples.at(-1)[0];
      el('replayToggle').textContent = '一時停止'; controls.forEach(control => { control.disabled = false; });
    } catch {
      if (token === fetchToken && active) el('replayNote').textContent = 'この記録のゴーストを読み込めませんでした。ランキングに戻って選び直してください。';
    }
  }
  el('replayClose').addEventListener('click', close);
  el('replayToggle').addEventListener('click', () => { if (active) { active.paused = !active.paused; update(0); } });
  el('replayRestart').addEventListener('click', () => { if (active?.ghost) { active.time = active.ghost.samples[0][0]; active.paused = false; update(0); } });
  el('replaySeek').addEventListener('input', event => { if (active?.ghost) { active.time = Number(event.target.value); update(0); } });
  el('replayView').addEventListener('change', () => update(0));
  document.addEventListener('keydown', event => {
    if (active && event.code === 'Escape') { event.preventDefault(); close(); }
    if (!active && event.code === 'KeyH' && !event.repeat && game.modeRef() === 'play') showBest = !showBest;
  });
  const target = new Geom.Vector3();
  function update(dt) {
    if (active) {
      if (!active.ghost) return;
      const path = active.ghost.samples, end = path.at(-1)[0];
      if (!active.paused) active.time = Math.min(end, active.time + dt * Number(el('replaySpeed').value));
      if (active.time >= end) active.paused = true;
      const pose = sampleReplay(path, active.time); poseAvatar(pose);
      const first = el('replayView').value === 'first'; avatar.visible = !first;
      camera.fov = 75; camera.updateProjectionMatrix();
      if (first) { camera.position.set(pose[1], pose[2] + (pose[6] === 2 ? 0.86 : 1.62), pose[3]); camera.rotation.set(pose[5], pose[4], 0, 'YXZ'); }
      else {
        target.set(pose[1], pose[2] + 1, pose[3]);
        const dx = Math.sin(pose[4]) * 5, dy = 2.5, dz = Math.cos(pose[4]) * 5, length = Math.hypot(dx, dy, dz);
        const hit = game.raycast(target.x, target.y, target.z, dx / length, dy / length, dz / length, length);
        const distance = hit ? Math.max(0.3, Math.min(length, hit.t - 0.25)) : length;
        camera.position.set(target.x + dx / length * distance, target.y + dy / length * distance, target.z + dz / length * distance); camera.lookAt(target);
      }
      el('replaySeek').value = active.time;
      el('replayClock').textContent = `${active.time.toFixed(1)} / ${end.toFixed(1)}秒`;
      el('replayToggle').textContent = active.paused ? '再生' : '一時停止';
      return;
    }
    if (game.modeRef() !== 'play' || z.over || z.mission) { avatar.visible = false; chip.hidden = true; return; }
    capture();
    chip.hidden = !best;
    chip.textContent = showBest ? `ゴースト ベスト ${best?.total}点（Hで切替）` : 'ゴースト 非表示（Hで切替）';
    if (!best || !showBest || z.t > best.ghost.samples.at(-1)[0]) { avatar.visible = false; return; }
    const pose = sampleReplay(best.ghost.samples, z.t); poseAvatar(pose);
    avatar.visible = Math.hypot(pose[1] - c.pos.x, pose[2] - c.pos.y, pose[3] - c.pos.z) > 1.2;
  }
  return { start, snapshot, finish, update, open, close, get active() { return active; }, get samples() { return samples; }, get best() { return best; }, ghost: avatar };
}
