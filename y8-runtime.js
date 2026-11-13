import { Y8_CONFIG } from './y8-config.js';

// Loaded by both builds; only the portal package enables platform services.
if (typeof window !== 'undefined' && window.SKY_PLATFORM?.id === 'y8') installY8();

export function installY8(win = window, doc = document) {
  const game = win.__skyInternals;
  const endpoint = 'https://gunrun-runs.jirisuke0121.workers.dev';
  const nativeFetch = win.fetch.bind(win);
  let sdk, initialized = false, session = null, generation = 0, sessionFlight = null;
  let currentRun = null, background = doc.hidden, adActive = false, focusPaused = false;
  let adFlight = null, forwarded = null, readyAds = false;
  const qa = {sdkReady:false, auth:'loading', adRequests:0, adStatus:'idle'};
  const guest = () => { try { return win.localStorage.getItem('gunrun-pid'); } catch { return null; } };
  const labels = {
    ja:['Y8でログイン','ログアウト','Y8に接続できません。ゲストで遊べます。','Y8に接続中…'],
    en:['Sign in with Y8','Sign out','Y8 is unavailable. You can play as a guest.','Connecting to Y8…'],
    th:['เข้าสู่ระบบด้วย Y8','ออกจากระบบ','เชื่อมต่อ Y8 ไม่ได้ เล่นแบบผู้เยี่ยมชมได้','กำลังเชื่อมต่อ Y8…'],
    vi:['Đăng nhập bằng Y8','Đăng xuất','Không kết nối được Y8. Bạn vẫn có thể chơi với tư cách khách.','Đang kết nối Y8…'],
    pt:['Entrar com Y8','Sair','Y8 indisponível. Você pode jogar como visitante.','Conectando ao Y8…'],
    tr:['Y8 ile giriş yap','Çıkış yap','Y8 kullanılamıyor. Misafir olarak oynayabilirsiniz.','Y8 bağlantısı kuruluyor…'],
    es:['Iniciar sesión con Y8','Cerrar sesión','Y8 no está disponible. Puedes jugar como invitado.','Conectando con Y8…'],
  };
  const button = doc.createElement('button'); button.id = 'y8Account'; button.type = 'button';
  const status = doc.createElement('span'); status.id = 'y8AccountStatus'; status.setAttribute('role','status');
  status.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)';
  button.style.cssText='max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  const mount = () => {
    const parent = doc.querySelector('.home-heading-actions');
    if (parent && !button.isConnected) {
      const nickname = doc.getElementById('homeName');
      if (nickname) { nickname.style.display='none'; nickname.before(button,status); }
      else parent.append(button,status);
    }
    const L = labels[win.skyI18n?.lang || doc.documentElement.lang] || labels.en;
    button.disabled = !sdk;
    const text = session ? `Y8 · ${L[1]} · ${session.name}` : L[0];
    if (button.textContent !== text) button.textContent = text;
    const note = qa.auth === 'error' ? L[2] : qa.auth === 'loading' ? L[3] : '';
    if (status.textContent !== note) status.textContent = note;
    button.title = note || text;
  };
  // Clear credentials immediately on every account change. A generation check
  // prevents an old account's slow response from authenticating the new one.
  function clearSession() { generation++; session = null; sessionFlight = null; }
  async function bootstrap(force = false) {
    if (!force && session && session.expiresAt > Date.now() + 300000) return session;
    if (sessionFlight) return sessionFlight;
    const version = generation;
    const flight = (async () => {
      let token = sdk?.getAccessToken();
      if (!token) return null;
      const send = access => nativeFetch(endpoint + '/auth/y8', {method:'POST', headers:{authorization:`Bearer ${access}`}, credentials:'omit', signal:AbortSignal.timeout(10000)});
      let response = await send(token);
      if (response.status === 401) { await sdk.refreshToken(); token = sdk.getAccessToken(); if (!token) return null; response = await send(token); }
      if (!response.ok) throw Error('Y8 session unavailable');
      const data = await response.json();
      if (!/^y8_[0-9a-f]{32}$/.test(data.player) || !data.session?.token || !(data.session.expiresAt > Date.now())) throw Error('Invalid Y8 session');
      if (version !== generation) return null;
      session = {player:data.player, name:data.name, ...data.session}; qa.auth = 'authenticated'; mount();
      win.skyRanking?.refreshTitle(); void win.skyRunRecording?.retry();
      return session;
    })();
    sessionFlight = flight;
    try { return await flight; } finally { if (sessionFlight === flight) sessionFlight = null; }
  }
  button.addEventListener('click', () => {
    // Must be called synchronously inside the click for Safari popup activation.
    try {
      if (session) { clearSession(); qa.auth = 'guest'; Promise.resolve(sdk.logout()).catch(() => {}); mount(); }
      else Promise.resolve(sdk.login()).catch(() => { qa.auth = 'error'; mount(); });
    } catch { qa.auth = 'error'; mount(); }
  });
  function ready() {
    if (initialized) return;
    initialized = true;
    try {
      sdk = win.y8.sdk();
      sdk.init({appId:Y8_CONFIG.appId, autoLogin:true}, {gameId:Y8_CONFIG.gameId, preloadAdBreaks:'on', sound:'on', onReady(){readyAds=true;}});
      sdk.onAuth((user, error) => {
        clearSession(); qa.auth = error ? 'error' : user ? 'loading' : 'guest'; mount();
        const version = generation;
        if (user && !error) void bootstrap().catch(() => { if (version === generation) { qa.auth = 'error'; mount(); } });
      });
      qa.sdkReady = true; mount();
    } catch { qa.auth = 'error'; mount(); }
  }
  const muted = () => background || adActive || focusPaused;
  function syncAudio() {
    const ctx = game.Ut.ctx;
    if (muted()) {
      if (ctx && ctx.state !== 'closed') Promise.resolve(ctx.suspend()).catch(() => {});
      for (const audio of doc.querySelectorAll('audio,video')) { if (!audio.muted) { audio.dataset.y8Muted='1'; audio.muted=true; } }
    } else {
      for (const audio of doc.querySelectorAll('[data-y8-muted]')) { audio.muted=false; delete audio.dataset.y8Muted; }
      win.skyAudioRecovery?.resume('y8-resume', true);
    }
  }
  function leave() {
    background = true;
    if (game.modeRef() === 'play') { focusPaused = true; game.An('pause'); doc.exitPointerLock?.(); }
    syncAudio();
  }
  function focus() { background = doc.hidden; syncAudio(); }
  win.addEventListener('blur', leave);
  win.addEventListener('focus', focus);
  doc.addEventListener('visibilitychange', () => doc.hidden ? leave() : focus());
  win.addEventListener('pagehide', leave);
  win.addEventListener('pageshow', focus);
  function showStartAd() {
    if (adFlight) return adFlight;
    if (!sdk || !readyAds) return Promise.resolve();
    adFlight = new Promise(resolve => {
      let settled = false;
      const finish = result => {
        if (settled) return; settled = true;
        win.clearTimeout(timer); adActive = false; qa.adStatus = result; syncAudio(); resolve();
      };
      // A blocked provider must not trap the Start button. Once an ad actually
      // starts, its callbacks own the pause, so the timeout is cancelled.
      const timer = win.setTimeout(() => finish('unavailable'), 8000);
      qa.adRequests++; qa.adStatus='requested';
      try {
        Promise.resolve(sdk.showAd({type:'start', name:'start-run',
          beforeAd(){ if (settled) return; win.clearTimeout(timer); adActive=true; qa.adStatus='showing'; syncAudio(); },
          afterAd(){ finish('finished'); }, adBreakDone(info){ finish(info?.breakStatus || 'done'); },
        })).catch(() => finish('error'));
      } catch { finish('error'); }
    }).finally(() => { adFlight = null; });
    return adFlight;
  }
  win.addEventListener('click', event => {
    const target = event.target.closest?.('#bStart,#bRetry,#bRestart');
    if (!target || target.disabled) return;
    if (forwarded === target) { forwarded = null; return; }
    // Tutorial entry and menu navigation never request advertisements.
    if (!sdk || !readyAds) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (adFlight) return;
    game.initAudio();
    void showStartAd().then(() => { forwarded=target; target.click(); forwarded=null; });
  }, true);
  const api = {
    qa, get blocked(){return background || adActive;}, get muted(){return muted();},
    player:() => session?.player || guest(), runPlayer:() => currentRun || session?.player || guest(),
    beginRun(){ currentRun=session?.player || guest(); },
    modeChanged(mode){ if (mode === 'play' && !background && !adActive) focusPaused=false; syncAudio(); },
    async fetch(input, init) {
      const url = new URL(String(input), win.location.href);
      if (url.origin !== endpoint || url.pathname !== '/runs' || init?.method !== 'POST') return nativeFetch(input, init);
      const data = JSON.parse(init.body);
      if (!data.player?.startsWith('y8_')) return nativeFetch(input, init);
      const account = await bootstrap();
      if (!account || account.player !== data.player) throw Error('Sign in to the Y8 account used for this run to send it.');
      const send = value => nativeFetch(input, {...init, credentials:'omit', headers:{...init.headers, authorization:`Bearer ${value.token}`}});
      let response = await send(account);
      if (response.status === 401) {
        const renewed = await bootstrap(true);
        if (renewed?.player === data.player) response = await send(renewed);
      }
      return response;
    },
  };
  win.skyY8=api;
  const observer = new MutationObserver(mount); observer.observe(doc.body,{childList:true,subtree:true}); mount();
  win.addEventListener('y8sdk.ready', ready, {once:true}); win.y8?.emitReadyEvent?.();
  win.setTimeout(() => { if (qa.auth === 'loading') { qa.auth='guest'; mount(); } }, 5000);
  return api;
}
