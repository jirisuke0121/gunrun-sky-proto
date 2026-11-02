// Coarse browser-reported capabilities, not a hardware benchmark or fingerprint.
export function environmentProfile(nav, display, ratio) {
  const ua = String(nav.userAgent || '');
  const bounded = (v, min, max) => Number.isFinite(v) && v >= min && v <= max ? v : null;
  const match = (pattern) => pattern.exec(ua)?.[1]?.replaceAll('_', '.') ?? null;
  const os = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1) ? 'ios'
    : /Android/.test(ua) ? 'android' : /Windows/.test(ua) ? 'windows' : /Macintosh|Mac OS X/.test(ua) ? 'macos' : /Linux/.test(ua) ? 'linux' : null;
  const browser = /Edg(?:A|iOS)?\//.test(ua) ? 'edge' : /SamsungBrowser\//.test(ua) ? 'samsung'
    : /Firefox\/|FxiOS\//.test(ua) ? 'firefox' : /Chrome\/|CriOS\//.test(ua) ? 'chrome' : /Safari\//.test(ua) ? 'safari' : null;
  const versions = {edge: /Edg(?:A|iOS)?\/(\d+)/, samsung: /SamsungBrowser\/(\d+)/, firefox: /(?:Firefox|FxiOS)\/(\d+)/, chrome: /(?:Chrome|CriOS)\/(\d+)/, safari: /Version\/(\d+)/};
  const osVersions = {ios: /(?:CPU (?:iPhone )?OS|iPhone OS) (\d+(?:_\d+)?)/, android: /Android (\d+(?:\.\d+)?)/, windows: /Windows NT (\d+(?:\.\d+)?)/, macos: /Mac OS X (\d+(?:_\d+)?)/};
  return {os, osVersion: osVersions[os] ? match(osVersions[os]) : null,
    browser, browserVersion: versions[browser] ? match(versions[browser]) : null,
    model: null, cores: bounded(nav.hardwareConcurrency, 1, 256), memoryGb: bounded(nav.deviceMemory, .25, 64),
    screenWidth: bounded(display?.width, 1, 20000), screenHeight: bounded(display?.height, 1, 20000), nativeRatio: bounded(ratio, .5, 8)};
}
export function collectEnvironment(nav, display, ratio, update) {
  const value = environmentProfile(nav, display, ratio);
  // Model hints are optional. Do not delay boot/start or infer an iPhone model.
  if (value.os === 'android' && nav.userAgentData?.getHighEntropyValues) {
    Promise.resolve().then(() => nav.userAgentData.getHighEntropyValues(['model'])).then(hints => {
      if (typeof hints?.model !== 'string') return;
      const model = hints.model.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 64);
      if (model && !/^(K|Android)$/i.test(model)) { value.model = model; update?.(value); }
    }).catch(() => {});
  }
  return value;
}
