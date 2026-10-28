// Published old-town bars. Editor drafts are never read by gameplay.
(() => {
  const params = new URLSearchParams(location.search);
  const preview = params.get('oldtown_swing') === '1';
  window.skyOldTownSwingPreview = preview;
  window.buildOldTownSwingCourse = ({ ne }) => {
    const box = (id, a, b, type = 'slab') => {
      const solid = ne(...a, ...b, type);
      solid.oldTownSwing = id;
      solid.tint = id.includes('step') || id.includes('pad') ? 0xe39a4a : 0x8ea4bd;
      return solid;
    };
    // ① Keep the original optional branch and the wall-jump landing beam.
    box('recovery-floor', [-25.2, -2.6, 11.8], [-14, 0, 15.2]);
    box('entry-step-1', [-22, 0, 14.8], [-20, .4, 15.2]);
    box('entry-step-2', [-22, 0, 14.4], [-20, .8, 14.8]);
    box('launch-pad', [-22, 0, 12.5], [-20, 1.2, 14.4]);
    const bars = [
      { id:'oldtown-west-bar-1', at:[-22.7,4.1,14], direction:[-1,0], width:2.6, route:'west' },
      // Independent crossings between the ORIGINAL north and south catwalks.
      { id:'oldtown-high-bar-1', at:[-41.9,15.4,-7.9], direction:[0,1], width:2.6, route:'high', launchWindow:[.35,.82] },
      { id:'oldtown-high-bar-2', at:[-35.7,15.4,-2.1], direction:[0,-1], width:2.6, route:'high-return', launchWindow:[.35,.82] },
      // Gain 2.1 m between the existing western warehouse roofs.
      { id:'oldtown-warehouse-bar-1', at:[-68,7.8,5.5], direction:[0,1], width:2.6, route:'warehouse' },
      // Keep height from the photo's descending beam to the existing east roof.
      { id:'oldtown-east-bar-1', at:[24,8.4,1.5], direction:[1,0], width:2.6, route:'east' },
      { id:'oldtown-east-bar-2', at:[28.8,8.4,1.5], direction:[1,0], width:2.6, route:'east', exitHint:'屋根が近づいたら北へ / 逆入力で減速' },
    ];
    // Mounts describe visible steel work. Existing roofs/walls carry the bars;
    // no new landing decks or floors are added to force a successful jump.
    const supports=[];
    const strut=(from,to)=>supports.push({from,to});
    for(const z of [12.55,15.45]) {
      box('west-post-'+z,[-22.77,0,z-.07],[-22.63,4.16,z+.07],'beam');
    }
    for(const [x,y,z,pivotZ] of [[-44.2,14.4,-7.8,-7.9],[-39.6,13.9,-7.8,-7.9],[-39.6,13.4,-1.3,-2.1],[-31.4,12.8,-1.3,-2.1]]) {
      strut([x,y,z],[x,16.2,z]);strut([x,16.2,z],[x,16.2,pivotZ]);
      strut([x,y+.4,z],[x,16.2,pivotZ]);
    }
    for(const [x0,x1,z] of [[-44.2,-39.6,-7.9],[-39.6,-31.4,-2.1]]) {
      strut([x0,16.2,z],[x1,16.2,z]);
    }
    for(const b of bars.filter(b=>b.route.startsWith('high')))for(const side of [-1,1])
      strut([b.at[0]+side*1.45,16.2,b.at[2]],[b.at[0]+side*1.45,b.at[1],b.at[2]]);
    for(const x of [-69.45,-66.55]) {
      strut([x,4.4,4.75],[x,7.8,4.75]);strut([x,7.8,4.75],[x,7.8,5.5]);
      strut([x,6.9,4.75],[x,7.8,5.5]);
    }
    for(const b of bars.filter(b=>b.route==='east')) {
      strut([b.at[0],b.at[1]+.85,-1.45],[b.at[0],b.at[1]+.85,2.95]);
      strut([b.at[0],b.at[1]+2.5,-1.45],[b.at[0],b.at[1]+.85,2.95]);
      for(const z of [.05,2.95])strut([b.at[0],b.at[1]+.85,z],[b.at[0],b.at[1],z]);
    }
    const routes = [
      { id:'west', name:'① 西壁から屋根', approach:[-14.36,0,2.5], yaw:Math.PI, pad:[-20.8,1.2,14], exit:[-28,2.8,14] },
      { id:'high', name:'② 高層回廊・南へ', approach:[-41.9,11.9,-10.9], yaw:Math.PI, exit:[-41.9,11.9,1.2] },
      { id:'high-return', name:'② 高層回廊・北へ', approach:[-35.7,11.9,.9], yaw:0, exit:[-35.7,11.9,-11.3] },
      { id:'warehouse', name:'③ 倉庫の低い屋根→高い屋根', approach:[-68,4.4,3.8], yaw:Math.PI, exit:[-68,6.5,12] },
      { id:'east', name:'④ 写真の斜め梁→東の屋根', approach:[20.25,5.7,3], yaw:-Math.PI/2, exit:[43,3,2.5] },
    ];
    window.skyOldTownSwingCourse = {
      id:'oldtown-swing-terrain-v1', oldTown:true, name:'旧市街の鉄棒', bars, routes, supports,
      approach:routes[0].approach, approachYaw:Math.PI, pad:routes[0].pad, exit:routes[0].exit,
      exitBounds:[-32,-25,12,18], signs:[], arrows:[],
      instructions:'橙色の握りが鉄棒の目印。①西壁→屋根、②南北の高層回廊を横断、③倉庫の低い屋根→高い屋根、④東の斜め梁→東の屋根。空中で自動につかみ、前へ振れたらジャンプを押し直す。下入力で離す。④は屋根が近づいたら北へ曲がる。',
    };
  };
  addEventListener('load',()=>{
    const game=window.__game,sky=window.__skyInternals,course=window.skyOldTownSwingCourse;
    if(!game||!sky||!course)return;
    const card=document.createElement('section');card.id='oldTownSwingPreview';
    card.style.cssText='margin:0 0 16px;padding:12px;border:1px solid #ffb647;border-radius:10px;background:#2c3028;color:#fff4df';
    const title=document.createElement('strong');title.textContent='旧市街・鉄棒ルート';
    const note=document.createElement('p');note.style.cssText='font-size:13px;line-height:1.6;margin:8px 0';
    note.textContent=preview?'入口から試せます。つかめる高さからの逆向き・斜め進入にも対応。この練習入口からの記録は送信しません。':'①〜④の鉄棒を配置しました。下のリンクで、それぞれの入口から試せます。';
    card.append(title,note);
    for(const route of course.routes){
      const control=document.createElement(preview?'button':'a');control.textContent=route.name;
      control.style.cssText='display:inline-block;margin:4px;padding:8px;color:'+(preview?'#292218':'#ffe0a0');
      if(params.get('swing_route')===route.id)control.style.outline='3px solid #7ee4c4';
      if(preview){control.type='button';control.onclick=()=>{game.startGame();game.placeAt({x:route.approach[0],y:route.approach[1],z:route.approach[2],yaw:route.yaw});sky.z.safeT=5;};}
      else control.href='./index.html?oldtown_swing=1&swing_route='+route.id;
      card.append(control);
    }
    (document.getElementById('ovStart')?.querySelector('.plate')||document.getElementById('ovStart'))?.prepend(card);
    if(preview){const n=document.getElementById('recNote');if(n)n.textContent='鉄棒の練習入口：プレイ記録は送信しません。';}
  });
})();
