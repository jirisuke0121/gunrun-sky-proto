// Nickname rules shared by the game (input check) and the Worker (final check before it is stored/shown).
// Same rule as NIGHTLINE's racer name: 2-14 letters/digits/_/-, NFKC-normalised, upper-cased.
(function (root) {
  const PATTERN = /^[\p{L}\p{N}_-]{2,14}$/u;
  const MESSAGE = '2〜14文字の文字・数字・_・-で入力してください';
  // Returns the normalised name, or '' when it is not an acceptable name.
  function normalize(raw) {
    if (typeof raw !== 'string') return '';
    const value = raw.trim().normalize('NFKC').toUpperCase();
    return PATTERN.test(value) ? value : '';
  }
  const api = { normalize, MESSAGE, MIN: 2, MAX: 14 };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.skyPlayerName = api;
})(globalThis);
