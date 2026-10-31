// Published escape branches. Editor drafts never change terrain or gameplay.
(() => {
  const params = new URLSearchParams(location.search);
  const preview = params.get('oldtown_swing') === '1';
  window.skyOldTownSwingPreview = preview;
  window.buildOldTownSwingCourse = ({ ne, us = [] }) => {
    const stairGroups = new Map();
    const box = (id, a, b, type='beam', tint=0x8ea4bd) => {
      const solid=ne(...a,...b,type);solid.oldTownSwing=id;solid.tint=tint;
      // Groups are authored stair runs, never unrelated nearby props.
      if (/-(?:stair|return|runout)-\d+$/.test(id)) {
        const key=id.replace(/-\d+$/, '');
        if(!stairGroups.has(key))stairGroups.set(key, []);
        stairGroups.get(key).push(solid);
      }
      return solid;
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
    box('high-return-step',[-37,14.3,-1.1],[-36.5,14.6,.5],'slab',0xe39a4a);
    box('high-pillar-step',[-38,13.5,-1.6],[-37.5,13.8,-1.1],'slab',0xe39a4a);
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
    for(let i=0;i<5;i++) {
      const top=6.4-(i+1)*.36,z=4.5+i*.6;
      box('warehouse-far-stair-'+i,[-53.2,top-.25,z],[-51.2,top,z+.6],'slab',0xe39a4a);
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
    // ground-level approach. End before the screen so a full capsule fits.
    for(let i=0;i<90;i++)box('east-tower-stair-'+i,[44+i*17.5/90,3.3,-14.2],[44+(i+1)*17.5/90,14.4-i*.12,-11.8],'slab',0xe39a4a);
    box('east-outer-screen',[61.85,3.6,-14.2],[62.1,6.2,4.2],'mono',0xb5604a);
    box('east-south-rail',[51.5,3.6,4.05],[61.85,4.5,4.2]);
    // The north corner landing joins here; keep the eastern rail cap.
    box('east-north-rail',[61.4,3.6,-14.2],[61.85,4.5,-14.05]);
    box('east-lower-recovery',[46,-1.3,1.2],[62,-1,4.2]);
    // Recover south of the 3m roof face, with steps within ordinary foot reach.
    box('east-recovery-step-1',[46.5,-1.1,3.2],[47,-2/3,4.2],'slab',0xe39a4a);
    box('east-recovery-step-2',[46,-1.1,3.2],[46.5,-1/3,4.2],'slab',0xe39a4a);
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
    box('east-pillar-arrival',[29.5,6.72,-1.5],[36.8,7,.25]);
    box('east-pillar-turn',[35,6.72,-2.5],[36.8,7,-1.5]);
    for(const x of [30,33.5])strut([x,5.5,-1.45],[x,6.72,.15]);

    // The next ledge wraps the existing tall east column. The new bar
    // crosses diagonally between the columns, clear of the original bars.
    // Leave a 7m opening after the first corner. A normal jump must not
    // replace the bar, including at the closest edges of these ledges.
    box('east-pillar-next-north',[38.6,7.12,-13.4],[41.4,7.4,-12]);
    box('east-pillar-next-corner',[37.6,7.12,-13.4],[38.6,7.4,-12]);
    // Keep the existing west-face ladder (x40, z-11) open from bottom to
    // rooftop. The ledge goes around the outside of its climbing space.
    box('east-pillar-next-west',[37.6,7.12,-12],[39,7.4,-9.5]);
    box('east-pillar-next-west-south',[39,7.12,-10.5],[40,7.4,-9.5]);
    box('east-pillar-next-west-north',[39,7.12,-12],[40,7.4,-11.7]);
    const pillarBar=[37.2,9.4,-5.8],pillarSide=[2/Math.sqrt(5),1/Math.sqrt(5)];
    for(const sign of [-1,1]) {
      const end=[pillarBar[0]+sign*pillarSide[0]*1.45,9.4,pillarBar[2]+sign*pillarSide[1]*1.45];
      const mount=[end[0],10.35,end[2]];
      strut(end,mount);strut(sign<0?[35,10.35,-4.8]:[40,10.35,-7.8],mount);
    }

    // Walkable returns connect both ledges to existing roofs and ground.
    // Chasers take these longer mantle/stair paths instead of the new bar.
    for(let i=0;i<9;i++) {
      const z=.25+i*.6,top=6.6-i*.4;
      box('east-pillar-return-stair-'+i,[35.3,3,z],[36.7,top,z+.6],'slab',0xe39a4a);
    }
    box('east-pillar-return-foot',[36.7,2.72,3],[42,3,5.65]);
    // The original outer-tower stair occupies the tower's northeast side.
    // Return around the northwest terrace instead of building into it or
    // bridging the new swing gap. The existing tower ladder stays usable.
    box('east-pillar-next-backwalk',[30.5,7.12,-15],[39.8,7.4,-13.4]);
    for(let i=0;i<11;i++) {
      const x=35.5-i*.5,top=3.4+i*.4;
      box('east-pillar-next-stair-'+i,[x,3.1,-13.4],[x+.5,top,-11.8],'slab',0xe39a4a);
    }
    // Meet the first (3.4m) upper tread from its east side. The previous
    // overlap crossed the 4.2m tread, creating an unavoidable 0.8m cliff.
    // Start north of the existing ground-level parapet, with a clear turn.
    box('east-pillar-next-lower-landing',[35.5,3.1,-13.4],[37,3.4,-11.8],'slab',0xe39a4a);
    for(let i=0;i<34;i++) {
      const z=-9.2-(i+1)*2.6/34,top=.1*(i+1);
      box('east-pillar-next-lower-stair-'+i,[35.5,-.25,z],[37,top,z+2.6/34],'slab',0xe39a4a);
    }
    for(const x of [34,37])strut([x,3.4,-13],[x,7.12,-14.6]);
    // A missed northern landing has a low return to the old east footing.
    // The original straight three-bar lane at z1.5 remains open.
    box('east-pillar-recovery',[21.5,-1.4,-1.45],[34,-1.1,2.6]);

    // The two central-building corners are optional escapes from the upper
    // south landing and north balcony. Keep real gaps: the bars, rather than
    // a continuous bridge, take the player onto the west-face ledges.
    box('south-corner-launch',[-4.3,3.7,16.4],[-3,4,17.8]);
    // The roof ladder climbs at (0,-14.54). Its entire shaft stays clear.
    box('north-corner-launch',[-3.4,3.7,-16.7],[.5,4,-15.1]);
    box('south-corner-ledge',[-22,3.9,13],[-15.2,4.2,17.8]);
    box('north-corner-ledge',[-22,3.9,-17.4],[-15.2,4.2,-13]);
    // Small arrival lips stay beyond the ends of the original wall-run faces.
    box('south-corner-arrival-lip',[-15.2,3.9,16.3],[-14.05,4.2,17.8]);
    box('north-corner-arrival-lip',[-15.2,3.9,-17.4],[-14.05,4.2,-15.1]);
    // Keep the original west-wall run and outward kick corridor free.
    // The inner ledge edge stays 1.2m from the wall; stairs sit 6.6m away.
    // Both corners have a slower walkable return to the existing west street.
    // These stairs stay behind the landing, out of the bar's flight lane;
    // pursuers can reach the ledges without crossing either aerial shortcut.
    for(let i=0;i<14;i++) {
      const top=4.2-i*.3;
      box('south-corner-return-'+i,[-22,-.3,13-(i+1)*.4],[-20.6,top,13-i*.4],'slab',0xe39a4a);
      box('north-corner-return-'+i,[-22,-.3,-13+i*.4],[-20.6,top,-13+(i+1)*.4],'slab',0xe39a4a);
    }
    // The last treads overlap the old ground floor; no unsupported final step.
    box('south-corner-foot',[-22,-.3,7.1],[-20.6,0,7.8]);
    box('north-corner-foot',[-22,-.3,-7.8],[-20.6,0,-7.1]);
    // The north gap used to have no floor. A miss costs height, with a lower
    // route back to the street instead of a forced fall into the void.
    box('north-corner-recovery',[-19.5,-3.8,-17.4],[1,-3.5,-14]);
    for(let i=0;i<10;i++) {
      const z=-14+i*.65,top=-3.5+(i+1)*.35;
      box('north-corner-recovery-stair-'+i,[-19.5,-3.8,z],[-17.7,top,z+.65],'slab',0xe39a4a);
    }
    for(const z of [-16.7,-13.7,13.7,17.1]) {
      strut([-21.9,2.6,z],[-20.9,3.9,z]);
    }
    // Suspend the grips from the facade without blocking the body arc.
    for(const [x,z] of [[-6.7,17],[-6.2,-15.5]])for(const side of [-1,1]) {
      const end=[x,6.8,z+side*1.45],mount=[x,8.4,z+side*1.45];
      strut(end,mount);strut(mount,[x,8.4,z>0?14:-14]);
    }

    // Photo 1: the 0m footing north of the east tower, below the orange stairs.
    // Follow the photo line west to the existing beam and ④'s branch.
    // Retain the earlier east-facing catwalk option as a separate choice.
    box('tower-corner-launch',[44.4,-.3,-17],[46.4,0,-13.8]);
    // Photo's red line goes WEST, towards the existing beam and ④'s ledges.
    // Keep this landing north of the upper backwalk so the hook arc is open.
    box('tower-west-arrival',[34.4,3.1,-17.2],[38,3.4,-13.2]);
    const towerWestHook=[36.2,5.6,-16.2];
    // Append after the previous east hook to preserve every existing index.
    box('tower-corner-arrival',[59.6,3.3,-16.5],[61.85,3.6,-14.05]);
    // The original stair's south edge drops about 1m onto the outer walk.
    // Break that drop into ordinary steps so grounded edge assistance lets
    // the player continue after landing, without another forced jump.
    for(let i=0;i<4;i++) {
      const z=-11.8+i*.55,top=[4.6,4.25,3.9,3.6][i];
      box('tower-corner-runout-'+i,[59.8,3.3,z],[61.85,top,z+.55],'slab',0xe39a4a);
    }
    const towerHook=[60.9,5.8,-15.25];
    us.push(towerHook,towerWestHook);
    strut([34.5,3.1,-16.2],[34.5,5.6,-16.2]);
    strut([34.5,5.6,-16.2],towerWestHook);
    strut([61.85,5.8,-15.25],towerHook);
    strut([61.85,3.3,-15.25],[61.85,5.8,-15.25]);

    // Photo 2: turn EAST from the LOWER north balcony, then swing south
    // along the east facade to its existing 0m side-exit landing.
    box('north-east-launch',[13.8,-.3,-17],[16.5,0,-14]);
    box('north-east-recovery', [14.25,-3.8,-14.5],[18.2,-3.5,-5.6]);
    // Return outside the upper balcony's footprint, with standing clearance.
    box('north-east-recovery-top',[14,-.3,-18.6],[18.2,0,-17.8]);
    box('north-east-recovery-turn',[14,-.3,-17.8],[16.4,0,-16.5]);
    for(let i=0;i<10;i++) {
      const z=-17.8+i*.65,top=-(i+1)*.35;
      box('north-east-recovery-stair-'+i,[16.4,-3.8,z],[18.2,top,z+.65],'slab',0xe39a4a);
    }
    for(const x of [14.05,16.95]) {
      strut([x,2.8,-10.2],[x,5,-10.2]);
    }
    strut([14,5,-10.2],[16.95,5,-10.2]);

    // Local turning space and a lower return, without filling the 4m jump.
    box('south-bridge-turn',[20.8,-.35,22.8],[23.2,0,25.2]);
    box('south-bridge-launch',[34.7,-.35,20],[37.3,0,22]);
    box('south-bridge-recovery',[34.5,-3.85,14],[39.4,-3.5,20]);
    for(let i=0;i<10;i++){const z=14+i*.4,top=-(i+1)*.35;
      box('south-bridge-return-'+i,[37.5,-3.85,z],[39.4,top,z+.4],'slab',0xe39a4a);}
    for(const [id,steps] of stairGroups)window.skyStairWalk?.tag(steps,id);
    const bars=[
      {id:'oldtown-high-bar-1',at:[-43.6,17.6,-3.9],direction:[0,1],width:2.6,route:'high'},
      {id:'oldtown-warehouse-bar-1',at:[-62.5,7.8,3.6],direction:[1,0],width:2.6,route:'warehouse'},
      {id:'oldtown-east-bar-1',at:[24,8.4,1.5],direction:[1,0],width:2.6,route:'east',exitHint:'直進：3連 / 左：柱の縁へ'},
      {id:'oldtown-east-bar-2',at:[32,8.4,1.5],direction:[1,0],width:2.6,route:'east'},
      {id:'oldtown-east-bar-3',at:[39.5,9.2,1.5],direction:[1,0],width:2.6,route:'east',exitHint:'外側に着地 → 南屋根のフック / 北の屋上'},
      {id:'oldtown-east-pillar-bar',at:pillarBar,direction:[1/Math.sqrt(5),-2/Math.sqrt(5)],width:2.6,route:'east-pillar',exitHint:'北西の縁へ / 離脱後は逆入力で減速'},
      {id:'oldtown-south-corner-bar',at:[-6.7,6.8,17],direction:[-1,0],width:2.6,route:'south-corner',exitHint:'西の角の縁へ → 既存の屋根フック / 西の通り'},
      {id:'oldtown-north-corner-bar',at:[-6.2,6.8,-15.5],direction:[-1,0],width:2.6,route:'north-corner',exitHint:'北西の角の縁へ → 西の通り / 屋根フック'},
      {id:'oldtown-north-east-bar',at:[15.5,2.8,-10.2],direction:[0,1],width:2.6,route:'north-east-corner',exitHint:'東側の既存通路へ → 右の出入口から建物の中へ'},
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
      {id:'east-pillar',name:'④ 分岐：柱の縁→鉄棒→次の縁',approach:[18.5,6.2,2.4],pursuitStart:[16,7.2,3],yaw:-Math.PI/2,exit:[39.3,7.4,-12.7],
       escape:[[38.8,7.4,-13.9],[30.8,7.4,-13.9],[30.8,7.4,-12.6],[36.4,3.4,-13],[38.5,0,-13]],
       alternate:[[38.8,7.4,-11.7],[39.46,7.4,-11],[39.46,14.4,-11],[43,14.4,-11]],
       returnVia:[36.5,3.4,-13],fallback:[33,-1.1,0],sharedBars:['oldtown-east-bar-1']},
      {id:'south-corner',name:'⑤ 南の踊り場→鉄棒→西の角',approach:[-2,4,17],yaw:Math.PI/2,exit:[-15.5,4.2,17],
       escape:[[-21.3,4.2,16.4],[-21.3,4.2,13.2],[-21.3,2.1,10.4],[-21.3,0,7.2],[-20,0,-1]],
       returnVia:[-21.3,0,7.2],fallback:[-10,0,16]},
      {id:'north-corner',name:'⑥ 北バルコニー→鉄棒→北西の角',approach:[2,4,-15.5],yaw:Math.PI/2,exit:[-15.5,4.2,-15.5],
       escape:[[-21.3,4.2,-15.5],[-21.3,4.2,-13.3],[-21.3,2.1,-10.4],[-21.3,0,-7.2],[-20,0,-5]],
       returnVia:[-21.3,0,-7.2],fallback:[-10,-3.5,-15.5]},
      {id:'tower-corner',name:'⑦ 東塔の足元→西のフック→既存の梁',approach:[45,0,-13],yaw:Math.PI/2,exit:[36.2,3.4,-16.2],
       escape:[[36.2,3.4,-15.7],[36.5,3.4,-13],[35.75,3.4,-13],[30.8,7.4,-13],[30.8,7.4,-13.9]],
       alternate:[[45,0,-16.2],[60.7,3.6,-15.25],[60.7,3.6,-7]],
       returnVia:[36.5,3.4,-13],hook:towerWestHook,alternateHook:towerHook,fallback:[44.5,0,-13]},
      {id:'north-east-corner',name:'⑧ 北の下段→鉄棒→東側通路',approach:[12,0,-15.5],yaw:-Math.PI/2,exit:[15.5,0,-4.8],
       escape:[[15.5,0,-3.7],[12,0,-3.7],[12,0,-9]],
       returnVia:[12,0,-3.7],fallback:[15.5,-3.5,-10.2]},
    ];
    window.skyOldTownSwingCourse={id:'oldtown-swing-escape-v1',oldTown:true,name:'旧市街の鉄棒と逃走分岐',bars,routes,supports,
      approach:routes[0].approach,approachYaw:routes[0].yaw,pad:routes[0].approach,exit:routes[0].exit,
      signs:[],arrows:[{at:[31.5,7.025,-.65],direction:[1,0]},{at:[35.7,7.025,-1.8],direction:[1/Math.sqrt(5),-2/Math.sqrt(5)]},
        {at:[-3.5,4.025,17],direction:[-1,0]},{at:[-.3,4.025,-15.5],direction:[-1,0]},
        {at:[-21.3,4.225,13.5],direction:[0,-1]},{at:[-21.3,4.225,-13.5],direction:[0,1]},
        {at:[45,0.025,-13.5],direction:[0,-1]},{at:[45,0.025,-16.2],direction:[-1,0]},{at:[36.2,3.425,-16.2],direction:[0,1]},
        {at:[60.7,3.625,-14.7],direction:[0,1]},
        {at:[12.8,.025,-15.5],direction:[1,0]},{at:[15.5,.025,-14.4],direction:[0,1]},
        {at:[15.5,.025,-3.7],direction:[-1,0]},{at:[15.3,-3.475,-12.5],direction:[1,0]}],
      instructions:'橙色の鉄棒から逃走分岐へ。②南の空中分岐、③倉庫の上階通路。④は最初の鉄棒から直進すると3連、左は柱の縁へ。⑤南の踊り場と⑥北バルコニーは西の角の縁へ渡り、西の通りや既存の屋根フックへ。⑦は東塔の足元から西のフックで既存の梁へ、⑧は北の下段から鉄棒で東側通路へ。空中で自動につかみ、前へ振れたらジャンプを押し直す。下入力で離す。',
    };
  };
  addEventListener('load',()=>{
    const game=window.__game,sky=window.__skyInternals,course=window.skyOldTownSwingCourse;
    if(!game||!sky||!course)return;
    const card=document.createElement('section');card.id='oldTownSwingPreview';
    card.style.cssText='margin:0 0 16px;padding:12px;border:1px solid #ffb647;border-radius:10px;background:#2c3028;color:#fff4df';
    const title=document.createElement('strong');title.textContent='旧市街・鉄棒から逃走分岐へ';
    const note=document.createElement('p');note.style.cssText='font-size:13px;line-height:1.6;margin:8px 0';
    note.textContent=(preview?'この練習入口からの記録は送信しません。':'各経路の入口から試せます。')+'④は最初の鉄棒で分岐。⑤⑥は西の角の縁へ。⑦は東塔の足元から北の縁へ出て、西（写真の左）のフックで既存の梁へ、⑧は北の下段から角を回って鉄棒で東側通路へ。空中移動の後は逆入力で減速します。';
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
