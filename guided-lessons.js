// Course state is separate from its presentation. Only native actions complete a lesson.
export function createLessons(sky, game, practice, progress) {
  const c = game.P, course = window.skyPracticeCourse;
  const changed = key => (game.stats[key] || 0) > (progress.stats[key] || 0);
  const landed = () => c.onGround && c.state === 'normal';
  const landedAfterSwing = () => changed('barJumps') && landed() && sky.jn.some(b =>
    !b.off && (b.swingCourse === 'upper-landing' || b.practice === 'dash-roof') &&
    Math.abs(c.pos.y - b.maxY) < .05 &&
    c.pos.x >= b.minX - c.r && c.pos.x <= b.maxX + c.r &&
    c.pos.z >= b.minZ - c.r && c.pos.z <= b.maxZ + c.r);
  const near = (at, r = 1.3) => Math.hypot(c.pos.x - at[0], c.pos.z - at[2]) < r && Math.abs(c.pos.y - at[1]) < 1;
  const make = (id, chapter, title, hint, goal, done, extra = {}) => ({
    id, chapter, title, hint, goal, done, checkpoint: course.sections.find(s => s.id === id), ...extra,
  });
  const lessons = [
    make('move', 0, ['道に沿って進もう', 'Follow the path'], ['離すと、その場で止まります', 'Release to stop'], [9, 2, 0], () => near([9, 2, 0])),
    make('vault', 0, ['低い壁は、そのまま越える', 'Keep moving over low walls'], ['前へ進むだけで乗り越えます', 'Move forward to vault automatically'], [16.5, 2, 0], () => c.pos.x > 13.1 && (changed('vaults') || changed('jumps') || changed('mantles'))),
    make('jump', 0, ['ジャンプで渡ろう', 'Jump across'], ['端でジャンプ', 'Jump at the edge'], [22, 2, 0], () => changed('jumps') && landed() && c.pos.x > 20.5 && c.pos.y > 1.9, { action: 'tJump' }),
    make('crouch', 0, ['低い所も、そのまま進む', 'Keep moving under the gate'], ['自動でかがみます', 'You crouch automatically'], [28, 2, 0], () => c.pos.x > 26.4 && c.pos.y > 1.9),
    make('mantle', 0, ['段差へ、ジャンプ', 'Jump up to the ledge'], ['縁をつかんで登れます', 'Catch the edge and climb up'], [34, 4.4, 0], () => changed('mantles') && c.pos.y > 4.3 && landed(), { action: 'tJump' }),
    make('wallrun', 1, ['壁を走って渡ろう', 'Run along the wall'], ['壁ぎわで前へ進みながらジャンプ', 'Move along the wall and jump'], [50, 4.4, -1.3], () => changed('wallruns') && c.pos.x > 46.2 && c.pos.y > 4.2 && landed(), { path: [[37, 4.4, -1.3]], action: 'tJump' }),
    make('hook', 1, ['ひし形のマークへ、フック', 'Hook to the diamond marker'], ['マークをタップ ／ Q', 'Tap the marker / Q'], [64, 6.6, 0], () => changed('hooks') && c.pos.x > 61 && c.pos.y > 5.1 && landed(), { action: 'hook' }),
    make('downhill', 1, ['斜面を滑ろう', 'Slide down'], ['斜面で「斜面滑り」 ／ C', 'Use Slide on the slope / C'], [83, 0, 0], () => changed('slides') && c.pos.x > 81.5 && c.pos.y < .5 && c.onGround, { action: 'tSlide', retryIf: () => c.pos.x > 82 && landed() && !changed('slides') }),
    make('ladder', 1, ['はしごを登ろう', 'Climb the ladder'], ['はしごへ、そのまま前入力', 'Move into it and keep moving forward'], [92, 4, 0], () => changed('ladders') && c.pos.y > 3.9 && landed(), { path: [[88, 0, 0]] }),
    make('zip', 1, ['ロープへ、ジャンプ', 'Jump to the zipline'], ['つかまれば自動で渡ります', 'Travel is automatic once attached'], [111.5, 2.8, -3.2], () => changed('zips') && c.pos.x > 107 && c.pos.y > 2.7 && landed(), { path: [[94, 4, 0]], action: 'tJump' }),
    make('walljump', 1, ['壁を蹴って、上へ', 'Kick off the wall'], ['ジャンプ → 空中でもう一度', 'Jump, then jump again in midair'], [119, 4, 0], () => changed('walljumps') && c.pos.x > 117.7 && c.pos.y > 3.9 && landed(), { path: [[115, 2.8, -3.2]], action: 'tJump' }),
    make('swing', 1, ['鉄棒で、向こうの足場へ', 'Swing onto the next roof'], ['前へ振れたらジャンプ', 'Jump as you swing forward'], [140, 6.8, 0], landedAfterSwing, { action: 'tJump' }),
    make('dash', 1, ['加速して、跳ぶ', 'Speed up and jump'], ['青いDASHを取って、先の屋上へ', 'Collect DASH and jump to the next roof'], [163, 0, 0], () => changed('dashPickups') && c.pos.x > 154 && c.pos.y < .2 && landed(), { action: 'tJump' }),
    make('pausefire',2,['自動射撃を一度止める','Pause automatic fire'],['踏み台を試すため、射撃を停止する','Pause fire to practise the springboard'],[165.5,0,0],()=>!sky.U.autoFire,{action:'tAutoFire'}),
    make('stomp', 2, ['追手を、踏み台にしよう', 'Use a pursuer as a springboard'], ['近くまで走って、ジャンプ', 'Run close, then jump'], () => practice.targets[0].pos.toArray(), () => changed('stomps'), { action: 'tJump' }),
    make('kick', 2, ['空中で、もう一度', 'Jump again in midair'], ['もう一度ジャンプで飛び蹴り', 'Jump again to kick'], () => practice.targets[1].pos.toArray(), () => changed('kicks'), { action: 'tJump' }),
    make('flash', 2, ['追手を止めよう', 'Stop the pursuers'], ['閃光玉を使う ／ 1', 'Use Flash / 1'], () => practice.targets[0].pos.toArray(), () => window.skyFlashbang.stats.affected > progress.flash, { action: 'tFlash' }),
    make('decoy', 2, ['分身に任せて、逃げる', 'Distract them and escape'], ['分身を出して、先のマークへ ／ 2', 'Use Decoy, then move to the marker / 2'], [181, 0, 0], () => progress.lured && c.pos.x > 180.3 && landed(), { action: 'tDecoy' }),
    make('blast', 3, ['赤い缶で、高く跳ぶ', 'Launch with the red barrel'], ['缶をタップ ／ B', 'Tap the barrel / B'], [198, 2, 0], () => changed('blastLaunches') && c.pos.x > 194 && c.pos.y > 1.9 && landed(), { action: 'barrel' }),
    make('jumpgun', 3, ['ジャンプ弾で、もう一つ上へ', 'Use the jump charge'], ['金色の弾を拾い、ジャンプ弾 ／ Z', 'Collect gold, then Launch / Z'], [220, 8, 0], () => changed('jumpGunLaunches') && c.pos.x > 214 && c.pos.y > 7.9 && landed(), { action: 'tJumpGun' }),
    make('shoot',3,['銃の自動操作を試そう','Try automatic aim and fire'],['自動射撃を再開し、その場で待つ','Resume automatic fire and wait'],[222,8,0],()=>game.G.reloadT<=0&&game.G.ammo>0&&progress.reloadSeen&&practice.targets.every(e=>e.dead)&&(game.stats.shots||0)>progress.stats.shots,{action:'tAutoFire'}),
    make('exit', 3, ['出口へ進もう', 'Head to the exit'], ['覚えた操作で、本番へ', 'Take these controls into a real run'], [243, 8, 0], () => near([243, 8, 0]) && landed()),
  ];
  if (new URLSearchParams(location.search).get('return') !== 'canyon') lessons.push(
    make('rescue', 3, ['最後は、自動で退避', 'One last escape upward'], ['救済を使う ／ V', 'Use Rescue / V'], [259, 11, 0], () => changed('rescues') && c.pos.y > 10.8 && landed(), { action: 'tRescue' })
  );
  // If a required action was missed, return from the landing beyond it rather
  // than leave the next marker behind a camera that cannot turn around.
  const missedAt = {hook:68,walljump:120.5,dash:155,stomp:174,kick:177,flash:184,decoy:184,blast:202,jumpgun:224,shoot:243};
  for(const lesson of lessons)if(missedAt[lesson.id]!==undefined){
    const retry=lesson.retryIf;
    lesson.retryIf=()=>retry?.()||(landed()&&c.pos.x>missedAt[lesson.id]&&!lesson.done());
  }
  function goal(lesson) {
    if (lesson.path?.[progress.path]) return lesson.path[progress.path];
    if (lesson.id === 'zip' && !changed('zips')) return [94, 6.3, 0];
    if (lesson.id === 'walljump' && !changed('walljumps')) return [115, 2.8, 0];
    if (lesson.id === 'dash' && !changed('dashPickups')) return course.dashPositions[0];
    if (lesson.id === 'blast' && !changed('blastLaunches')) return [188, 1.12, 0];
    if (lesson.id === 'jumpgun' && !window.skyJumpGun.carrying && !changed('jumpGunLaunches')) return course.jumpPositions[0];
    if (lesson.id === 'swing') {
      const bars = window.skySwing.course.bars, active = window.skySwing.active;
      const count = (game.stats.barJumps || 0) - (progress.stats.barJumps || 0);
      if (count >= 2 || active?.bar === bars[1]) return [140, 6.8, 0];
      return bars[count === 1 || active?.bar === bars[0] ? 1 : 0].at;
    }
    return typeof lesson.goal === 'function' ? lesson.goal() : lesson.goal;
  }
  return { lessons, goal, near };
}
