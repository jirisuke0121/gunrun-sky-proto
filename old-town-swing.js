// Published escape branches. Editor drafts never change terrain or gameplay.
(() => {
  const params = new URLSearchParams(location.search);
  const preview = params.get('oldtown_swing') === '1';
  window.skyOldTownSwingPreview = preview;
  window.buildOldTownSwingCourse = ({ ne }) => {
    const box = (id, a, b, type='beam', tint=0x8ea4bd) => {
      const solid=ne(...a,...b,type);solid.oldTownSwing=id;solid.tint=tint;return solid;
    };
    const supports=[];
    const strut=(from,to)=>supports.push({from,to});
    // ① removed, including its added launch steps and recovery floor.
    // The original west wall, landing beam and wall-jump route are untouched.

    // ② An upper branch across the south pillars. Its eastern end joins B2,
    // while its western edge drops to L2, 2.5 m below. That drop cannot be
    // copied by the western leap links (height difference > 1 m).
    box('high-launch',[-44.5,14.1,-7.8],[-42.8,14.4,-5.6]);
    box('high-arrival',[-44.2,14.7,2.8],[-41.8,15,9]);
    box('high-east-walk',[-43.5,14.7,2.8],[-35,15,4.6]);
    box('high-return-walk',[-36.5,14.7,-1.2],[-34.8,15,4.6]);
    box('high-far-step',[-38,13.95,-1.1],[-36.5,14.2,.5]);
    // Keep the departure and the western drop opening clear of supports.
    for(const x of [-45.2,-44.1]) {
      strut([x,13.5,-2],[x,18.4,-2]);strut([x,18.4,-2],[x,18.4,-3.9]);
    }
    strut([-45.2,18.4,-3.9],[-42,18.4,-3.9]);
    for(const x of [-45.05,-42.15])strut([x,18.4,-3.9],[x,17.6,-3.9]);
    for(const z of [3.8,8]) {
      strut([-44.6,12.6,z],[-43,14.7,z]);
      strut([-43,14.7,z],[-41.9,14.7,z]);
    }

    // ③ A new covered upper passage, entered across a 5 m break in the roofs.
    // Its east stairs return to the existing warehouse roof. Chasers enter
    // there after using the original crate pile, rather than crossing the bar.
    box('warehouse-gallery',[-59.8,6.15,2.5],[-51.2,6.4,4.5]);
    box('warehouse-screen',[-59.8,6.4,2.35],[-51.2,10.4,2.55],'mono',0xb5604a);
    box('warehouse-roof',[-59.8,10.4,2.35],[-51.2,10.65,4.5],'beam',0x8f4a3a);
    box('warehouse-south-rail',[-59.8,6.4,4.35],[-53.2,7.2,4.5]);
    for(let i=0;i<3;i++) {
      const top=5.8-i*.6,z=4.5+i;
      box('warehouse-far-stair-'+i,[-53.2,top-.25,z],[-51.2,top,z+1],'slab',0xe39a4a);
    }
    for(const z of [2.15,5.05]) {
      strut([-59.8,10.4,z],[-62.5,8.6,z]);strut([-59.8,7.4,z],[-62.5,8.6,z]);
      strut([-62.5,8.6,z],[-62.5,7.8,z]);
    }
    for(const x of [-59.3,-52])for(const z of [2.6,4.5])strut([x,3.4,z],[x,6.15,z]);

    // ④ Three bars reach a branch 5.5 m beyond the old east roof.
    // The gantry offers the south-roof hook or a northern tower ascent.
    // Its lower catch ledge is 4.6 m below, beyond a normal mantle height.
    box('east-arrival',[51.5,3.3,1.2],[62,3.6,4.2]);
    box('east-outer-walk',[59.5,3.3,-14.2],[62,3.6,4.2]);
    box('east-tower-return',[42,14.1,-14.2],[44.4,14.4,-10.8]);
    // Ascend to the existing tower instead of returning into the chaser's
    // ground-level approach. The ordinary vault/mantle still applies here.
    for(let i=0;i<90;i++)box('east-tower-stair-'+i,[44+i*.2,3.3,-14.2],[44+(i+1)*.2,14.4-i*.12,-11.8],'slab',0xe39a4a);
    box('east-outer-screen',[61.85,3.6,-14.2],[62.1,6.2,4.2],'mono',0xb5604a);
    box('east-south-rail',[51.5,3.6,4.05],[61.85,4.5,4.2]);
    box('east-north-rail',[60,3.6,-14.2],[61.85,4.5,-14.05]);
    box('east-lower-recovery',[46,-1.3,1.2],[62,-1,4.2]);
    box('east-recovery-step',[45.7,-1.3,1.2],[46.7,-.5,4.2],'slab',0xe39a4a);
    for(const x of [24,32]) {
      strut([x,9.25,-1.45],[x,9.25,2.95]);
      strut([x,10.9,-1.45],[x,9.25,2.95]);
      for(const z of [.05,2.95])strut([x,9.25,z],[x,8.4,z]);
    }
    for(const z of [-13,-7,2.5]) {
      strut([46,.2,z],[61,3.3,z]);strut([46,3.3,z],[61,3.3,z]);
    }
    for(const z of [.05,2.95]) {strut([40.8,3,z],[40.8,9.2,z]);strut([40.8,9.2,z],[39.5,9.2,z]);strut([42.8,3,z],[39.5,9.2,z]);}

    // ④ shares its first bar. Continue east for the unchanged three-bar
    // escape, or steer north onto this side ledge after the first release.
    // These decks follow the existing long wall (x17..35, z-6..-1.5).
    box('east-pillar-arrival',[26,6.52,-1.5],[36.4,6.8,.25]);
    box('east-pillar-turn',[35,6.52,-6],[36.4,6.8,-1.5]);
    box('east-pillar-back',[30,6.52,-7.4],[36.4,6.8,-6]);
    for(const x of [26.5,29.5,33.5])strut([x,5.5,-1.45],[x,6.52,.15]);

    // The next ledge wraps the existing tall east column. The new bar
    // crosses diagonally between the columns, clear of the original bars.
    box('east-pillar-next-south',[38.6,7.12,-6],[47.4,7.4,-4.6]);
    box('east-pillar-next-north',[38.6,7.12,-13.4],[47.4,7.4,-12]);
    // Keep the existing west-face ladder (x40, z-11) open from bottom to
    // rooftop. The ledge goes around the outside of its climbing space.
    box('east-pillar-next-west',[37.6,7.12,-12],[39,7.4,-6]);
    box('east-pillar-next-west-south',[39,7.12,-10.5],[40,7.4,-6]);
    box('east-pillar-next-west-north',[39,7.12,-12],[40,7.4,-11.7]);
    box('east-pillar-next-east',[46,7.12,-12],[47.4,7.4,-6]);
    const pillarBar=[37.2,9.4,-3.8],pillarSide=[2/Math.sqrt(5),1/Math.sqrt(5)];
    for(const sign of [-1,1]) {
      const end=[pillarBar[0]+sign*pillarSide[0]*1.45,9.4,pillarBar[2]+sign*pillarSide[1]*1.45];
      const mount=[end[0],10.35,end[2]];
      strut(end,mount);strut(sign<0?[35,10.35,-3]:[40,10.35,-6],mount);
    }

    // Walkable returns connect BOTH ledges to the existing 3m east roof.
    // Chasers take these longer mantle/stair paths instead of the new bar.
    for(let i=0;i<9;i++) {
      const x=36.4+i*.6,top=6.4-i*.4;
      box('east-pillar-return-stair-'+i,[x,3,-1.5],[x+.6,top,0],'slab',0xe39a4a);
    }
    for(let i=0;i<11;i++) {
      const tread=6.4/11,x=40.8+i*tread,top=3.4+i*.4;
      box('east-pillar-next-stair-'+i,[x,3,-4.6],[x+tread,top,-2.5],'slab',0xe39a4a);
    }
    // A missed northern landing has a low return to the old east footing.
    // The original straight three-bar lane at z1.5 remains open.
    box('east-pillar-recovery',[25.2,-1.4,-1.45],[34,-1.1,.6]);
    const bars=[
      {id:'oldtown-high-bar-1',at:[-43.6,17.6,-3.9],direction:[0,1],width:2.6,route:'high'},
      {id:'oldtown-warehouse-bar-1',at:[-62.5,7.8,3.6],direction:[1,0],width:2.6,route:'warehouse'},
      {id:'oldtown-east-bar-1',at:[24,8.4,1.5],direction:[1,0],width:2.6,route:'east',exitHint:'直進：3連 / 左＋逆入力で減速：柱の縁'},
      {id:'oldtown-east-bar-2',at:[32,8.4,1.5],direction:[1,0],width:2.6,route:'east'},
      {id:'oldtown-east-bar-3',at:[39.5,9.2,1.5],direction:[1,0],width:2.6,route:'east',exitHint:'外側に着地 → 南屋根のフック / 北の屋上'},
      {id:'oldtown-east-pillar-bar',at:pillarBar,direction:[1/Math.sqrt(5),-2/Math.sqrt(5)],width:2.6,route:'east-pillar',exitHint:'次の柱の縁へ / 下は既存の東屋根'},
    ];
    const routes=[
      {id:'high',name:'② 北柱→南の空中分岐',approach:[-43.6,14.4,-6.5],pursuitStart:[-45.8,14.4,-6.5],yaw:Math.PI,exit:[-43.6,15,6],
       escape:[[-43.6,15,8.6],[-47,12.5,9.5],[-49,12,14]],
       returnVia:[-37.6,13.4,-1.7],fallback:[-43.6,0,6]},
      {id:'warehouse',name:'③ 低い屋根→倉庫の上階通路',approach:[-66,4.4,3.6],yaw:-Math.PI/2,exit:[-55.5,6.4,3.6],
       escape:[[-52.2,6.4,3.6],[-52.2,4.6,8],[-49.3,0,2]],
       returnVia:[-52.2,4.6,8],fallback:[-63,0,3.6]},
      {id:'east',name:'④ 斜め梁→外側回廊→南屋根／屋上',approach:[20.25,5.7,3],pursuitStart:[17.75,6.7,3],yaw:-Math.PI/2,exit:[56,3.6,2.5],
       escape:[[56,3.6,2.5],[44.5,6.6,10.5],[43.2,4.4,5.7]],
       alternate:[[60.7,3.6,2.5],[60.7,3.6,-13],[44,14.4,-13],[44,14.4,-10]],
       returnVia:[44,14.4,-10],fallback:[47,-1,2.5]},
      {id:'east-pillar',name:'④ 分岐：柱の縁→鉄棒→次の縁',approach:[18.5,6.2,2.4],pursuitStart:[16,7.2,3],yaw:-Math.PI/2,exit:[39.3,7.4,-8],
       escape:[[39.3,7.4,-5.3],[46.8,7.4,-5.3],[46.8,7.4,-3.8],[41.2,3.4,-3.8],[43,3,1.5]],
       returnVia:[41.2,3,-2],fallback:[33,-1.1,0],sharedBars:['oldtown-east-bar-1']},
    ];
    window.skyOldTownSwingCourse={id:'oldtown-swing-escape-v1',oldTown:true,name:'旧市街の鉄棒と逃走分岐',bars,routes,supports,
      approach:routes[0].approach,approachYaw:routes[0].yaw,pad:routes[0].approach,exit:routes[0].exit,
      signs:[],arrows:[{at:[29.5,6.825,-.65],direction:[1,0]},{at:[35.7,6.825,-1.2],direction:[1/Math.sqrt(5),-2/Math.sqrt(5)]}],
      instructions:'橙色の鉄棒から逃走分岐へ。②南の空中分岐、③倉庫の上階通路。④は最初の鉄棒から直進すると3連→外側回廊、左へ曲がると柱の縁→鉄棒→次の柱の縁。既存の南屋根フック・北の屋上も使えます。空中で自動につかみ、前へ振れたらジャンプを押し直す。下入力で離す。',
    };
  };
  addEventListener('load',()=>{
    const game=window.__game,sky=window.__skyInternals,course=window.skyOldTownSwingCourse;
    if(!game||!sky||!course)return;
    const card=document.createElement('section');card.id='oldTownSwingPreview';
    card.style.cssText='margin:0 0 16px;padding:12px;border:1px solid #ffb647;border-radius:10px;background:#2c3028;color:#fff4df';
    const title=document.createElement('strong');title.textContent='旧市街・鉄棒から逃走分岐へ';
    const note=document.createElement('p');note.style.cssText='font-size:13px;line-height:1.6;margin:8px 0';
    note.textContent=(preview?'この練習入口からの記録は送信しません。':'各経路の入口から試せます。')+'④は最初の鉄棒で分岐。直進は3連→外側回廊、左は柱の縁→鉄棒→次の縁。左への離脱は逆入力で減速します。';
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
