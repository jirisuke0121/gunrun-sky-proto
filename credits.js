// Credits: a link inside the home development tab opens the third-party material list (see CREDITS.md).
// Names are proper nouns, so the list stays in English in both languages; only the link label is translated.
(() => {
  const params = new URLSearchParams(location.search);
  if (window.skyOwnerReplay || params.has('ownerReplay') || window.skyPracticeMode || params.has('practice')) return;
  const development = document.getElementById('homeDevelopment');
  if (!development || document.getElementById('homeCredits')) return;
  const make = (tag, props = {}, html = '') => Object.assign(document.createElement(tag), props, html ? { innerHTML: html } : {});
  const style = make('style', {}, `
    #homeCredits{display:block;grid-column:1/-1;justify-self:start;margin:8px 0 0;padding:6px 0;border:0;background:none;color:#a8b6c1;font:inherit;font-size:11px;cursor:pointer;text-decoration:underline}
    #creditsDialog{position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:12px;background:rgba(8,12,16,.78)}
    #creditsDialog[hidden]{display:none}
    #creditsDialog .credits-card{width:min(640px,100%);max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);overflow:auto;padding:16px 18px;border:1px solid #3a4855;border-radius:10px;background:#101a22;color:#dbe3e9;font-size:13px;line-height:1.55;user-select:text;-webkit-user-select:text;touch-action:pan-y}
    #creditsDialog h2{margin:0 0 8px;font-size:17px}
    #creditsDialog dt{margin-top:10px;font-weight:700;color:#e8b08e}
    #creditsDialog dd{margin:2px 0 0}
    #creditsDialog button{margin-top:14px;min-height:44px;padding:8px 18px;border:1px solid #657380;border-radius:8px;background:transparent;color:#dbe3e9;font:inherit;cursor:pointer}`);
  document.head.append(style);
  const dialog = make('div', { id: 'creditsDialog', hidden: true });
  // The licence text stays English; only the title and button follow the chosen language (th/vi/pt/tr/es).
  const L = (jp, en) => { const i = window.skyI18n; return i && i.lang !== 'ja' && i.lang !== 'en' ? i.tr(jp) : en; };
  dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', 'creditsTitle');
  dialog.innerHTML = `<div class="credits-card">
    <h2 id="creditsTitle">${L('クレジット', 'Credits')}</h2>
    <p>Zombie Parkour Escape (空中回廊 追跡) — made by jirisuke0121.</p>
    <dl>
      <dt>Engine</dt><dd>three.js (MIT License).</dd>
      <dt>3D models</dt><dd>Models created with Meshy – CC BY 4.0 License (weapons, ladder, zipline trolley, hook launcher, grapple anchor, smoke grenade, glove).
        Characters from the Apocalypse (pack) and the Easy Weapons explosion sound, via the Unity Asset Store.</dd>
      <dt>Sound</dt><dd>CC0 recordings from OpenGameArt.org: The Free Firearm Sound Library (Ben Jaszczak and others); RPG Sound Pack, Zombies Sound Pack and Swishes Sound Pack (artisticdude); Squish Sounds Effects (EZduzziteh); 80 CC0 creature SFX and 100 CC0 metal and wood SFX (rubberduck); Punch and 15 vocal male strain/hurt/pain/jump sounds (qubodup); Breathing Tired (mikeask); Fantozzi's Footsteps (Fantozzi); 50 RPG sound effects (Kenney); and other CC0 contributors.</dd>
      <dt>Font</dt><dd>Noto Sans JP (SIL Open Font License 1.1).</dd>
    </dl>
    <button id="creditsClose" type="button">${L('閉じる', 'Close')}</button>
  </div>`;
  document.body.append(dialog);
  const open = make('button', { id: 'homeCredits', type: 'button' }, 'クレジット');
  open.setAttribute('aria-haspopup', 'dialog');
  const close = () => { dialog.hidden = true; open.focus({ preventScroll: true }); };
  open.addEventListener('click', () => { dialog.hidden = false; document.getElementById('creditsClose').focus({ preventScroll: true }); });
  dialog.querySelector('#creditsClose').addEventListener('click', close);
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  dialog.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  development.append(open);
})();
