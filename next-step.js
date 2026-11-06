// What to recommend after an intro run, from that run's own result (NIGHTLINE's first drive ends the
// same way: the result decides the next step). Pure rules, no DOM; challenge-score.js shows the answer.
(function (root) {
  // Surviving this long in the intro run means the player can handle the real run.
  const READY_SECONDS = 60;
  const GOALS = {
    cleared: '2分間逃げ切れました。「本番イージーを始める」で、ライフ8の本番へ進めます。',
    ready: seconds => `${seconds}秒生き残りました。「本番イージーを始める」で、ライフ8の本番へ進めます。`,
    fell: '落下しました。縁・壁へ跳ぶとつかんで越えられます。もう一度入門で試そう。',
    caught: '追いつかれました。移動・逃げ道選びは自分で。もう一度入門で、段差や別の足場へ逃げてみよう。',
  };
  // primary: which result button to highlight ('next' = start the real run on Easy, 'retry' = intro again).
  function adviseNext({ elapsed = 0, cleared = false, reason = 'caught' } = {}) {
    const seconds = Math.max(0, Math.floor(Number(elapsed) || 0));
    if (cleared) return { primary: 'next', title: '入門クリア！', goal: GOALS.cleared };
    if (seconds >= READY_SECONDS) return { primary: 'next', title: '入門モード、おつかれさま！', goal: GOALS.ready(seconds) };
    return { primary: 'retry', title: '入門モード、おつかれさま！', goal: reason === 'fell' ? GOALS.fell : GOALS.caught };
  }
  const api = { adviseNext, READY_SECONDS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.skyNextStep = api;
})(globalThis);
