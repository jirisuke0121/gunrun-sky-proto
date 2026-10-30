// Shared graphics presets. Game simulation, enemy budgets and scoring are unchanged.
(() => {
  const storage = 'gunrun-render-quality-v1';
  const presets = {
    performance: { name: '軽量（推奨）', cap: .7, shadows: false, shadowSize: 512, description: '影を省き、3D描画の細かさを抑えて軽くします。文字と操作はそのままです。' },
    balanced: { name: '標準', cap: 1, shadows: true, shadowSize: 1024, description: '3D描画の細かさを抑え、影を表示します。' },
    high: { name: '高画質', cap: Infinity, shadows: true, shadowSize: null, description: '従来の細かさと影を使います。動作が重いときは軽量を選んでください。' },
  };
  let selected = 'performance', internals, game;
  const originalShadowSizes = new WeakMap();
  try { const saved = localStorage.getItem(storage); if (Object.hasOwn(presets, saved)) selected = saved; } catch {}
  const nativeRatio = () => Math.min(2, devicePixelRatio || 1);
  const pixelRatio = (scale = 1, native = nativeRatio()) => Math.max(.25, Math.min(native * (Number.isFinite(scale) ? scale : 1), presets[selected].cap));
  function sync() {
    document.body.dataset.skyRenderQuality = selected;
    for (const id of ['homeRenderQuality', 'settingsRenderQuality']) {
      const element = document.getElementById(id);
      if (!element) continue;
      element.value = selected;
      document.getElementById(id + 'Description').textContent = presets[selected].description;
    }
  }
  function apply() {
    if (!game) return;
    const renderer = game.debug.renderer, p = presets[selected], ratio = pixelRatio(internals.U.renderScale);
    if (Math.abs(renderer.getPixelRatio() - ratio) > .0001) renderer.setPixelRatio(ratio);
    const shaderChange = renderer.shadowMap.enabled !== p.shadows;
    renderer.shadowMap.enabled = p.shadows;
    internals.ue.traverse(node => {
      if (!node.isLight || !node.shadow) return;
      if (!originalShadowSizes.has(node)) originalShadowSizes.set(node, node.shadow.mapSize.clone());
      const original = originalShadowSizes.get(node), width = p.shadowSize ?? original.x, height = p.shadowSize ?? original.y;
      if (node.shadow.mapSize.x === width && node.shadow.mapSize.y === height) return;
      node.shadow.map?.dispose(); node.shadow.map = null;
      node.shadow.mapPass?.dispose(); node.shadow.mapPass = null;
      node.shadow.mapSize.set(width, height); node.shadow.needsUpdate = true;
    });
    renderer.shadowMap.needsUpdate = true;
    if (shaderChange) {
      const materials = new Set();
      for (const scene of [internals.ue, internals.fo]) scene.traverse(node => {
        if (node.material) for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
      });
      for (const material of materials) material.needsUpdate = true;
    }
    sync();
  }
  function select(id) {
    if (!Object.hasOwn(presets, id)) return;
    selected = id;
    try { localStorage.setItem(storage, selected); } catch {}
    apply(); sync();
    document.dispatchEvent(new CustomEvent('sky-render-quality-change'));
  }
  function control(id, labelText) {
    const box = document.createElement('div'); box.className = 'sky-quality-control';
    const label = document.createElement('label'); label.htmlFor = id; label.textContent = labelText;
    const selectElement = document.createElement('select'); selectElement.id = id;
    selectElement.setAttribute('aria-label', labelText); selectElement.setAttribute('aria-describedby', id + 'Description');
    for (const [id, p] of Object.entries(presets)) selectElement.add(new Option(p.name, id));
    const note = document.createElement('p'); note.className = 'note'; note.id = id + 'Description'; note.setAttribute('role', 'status');
    selectElement.addEventListener('change', () => select(selectElement.value));
    box.append(label, selectElement, note); return box;
  }
  window.skyRenderQuality = {
    presets, pixelRatio, apply, select,
    get mode() { return selected; },
    snapshot() {
      const renderer = game?.debug.renderer;
      return { mode: selected, pixelRatio: renderer?.getPixelRatio() ?? pixelRatio(), nativePixelRatio: devicePixelRatio || 1,
        buffer: renderer ? [renderer.domElement.width, renderer.domElement.height] : null, shadows: renderer?.shadowMap.enabled ?? presets[selected].shadows };
    },
    attach(s, g) {
      if (game) return; internals = s; game = g;
      const style = document.createElement('style');
      style.textContent = '.sky-quality-control{padding:12px;margin:12px 0;border:1px solid #75684e55;border-radius:10px}.sky-quality-control label{font-weight:700;margin-right:12px}.sky-quality-control select{font:inherit;color:inherit;background:var(--paper,#efe6d0);padding:7px;border:1px solid #75684e77;border-radius:6px}.sky-quality-control .note{margin:8px 0 0;font-size:12px;line-height:1.5}';
      document.head.append(style);
      document.getElementById('challengeDifficulty').closest('.challenge-select').before(control('homeRenderQuality', '描画品質'));
      document.getElementById('setGrid').before(control('settingsRenderQuality', '描画品質（設定）'));
      document.getElementById('bReset').addEventListener('click', () => select('performance'));
      apply(); sync();
    },
  };
})();
