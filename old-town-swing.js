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
      { id:'oldtown-west-bar-1', at:[-22.7,4.1,14], direction:[-1,0], width:2.6, route:'west', label:'1  > ROOF' },
      // ② North/south cut across the west high corridor, between the pillars.
      { id:'oldtown-high-bar-1', at:[-35.7,14.1,-8.3], direction:[0,1], width:2.6, route:'high', label:'2A  > SWING' },
      { id:'oldtown-high-bar-2', at:[-35.7,14.6,-4.5], direction:[0,1], width:2.6, route:'high', label:'2B  > SOUTH' },
      // ③ Existing warehouse crates -> low alley -> awning, with ground below.
      { id:'oldtown-warehouse-bar-1', at:[-56.7,6.9,6.7], direction:[1,0], width:2.6, route:'warehouse', label:'3  > AWNING' },
      // Photo: a separate lane south of the existing wall-run through the east gap.
      { id:'oldtown-east-bar-1', at:[22.5,3.2,5.3], direction:[1,0], width:2.6, route:'east', label:'4A  > SWING' },
      { id:'oldtown-east-bar-2', at:[27,4.4,5.3], direction:[1,0], width:2.6, route:'east', label:'4B  > TOWER' },
    ];
    for (const b of bars) {
      const side = [-b.direction[1], b.direction[0]], spread = b.route === 'high' ? 1.8 : 1.45;
      for (const sign of [-1,1]) {
        const x=b.at[0]+side[0]*sign*spread, z=b.at[2]+side[1]*sign*spread;
        const base = b.route === 'warehouse' ? (sign < 0 ? 3.4 : 4.6) : 0;
        box(b.id+'-post-'+sign,[x-.07,base,z-.07],[x+.07,b.at[1]+.06,z+.07],'beam');
      }
    }
    box('high-landing',[-37,11.5,-.4],[-34.4,11.9,8]);
    // Headroom remains above the warehouse's north door and both alley mouths.
    box('warehouse-awning',[-52,4.35,6],[-45.8,4.6,7.7],'beam');
    // The awning touches the warehouse roof and its existing crate return route.
    box('east-pad',[18,0,1.5],[20,.3,6.6]);
    // Recover below the new side lane, without filling the original wall-run gap.
    box('east-recovery',[19.5,-2.6,3.9],[34,-1.2,6.9]);
    for(let i=0;i<3;i++)box('east-recovery-step-'+i,[31+i*.8,-1.2,3.9],[31.8+i*.8,-.8+i*.4,6.9]);
    const routes = [
      { id:'west', name:'① 西壁から屋根', approach:[-14.36,0,2.5], yaw:Math.PI, pad:[-20.8,1.2,14], exit:[-28,2.8,14] },
      { id:'high', name:'② 西の高層回廊・2連', approach:[-35.7,11.9,-11.3], yaw:Math.PI, pad:[-35.7,11.9,-11.3], exit:[-35.7,11.9,3.5] },
      { id:'warehouse', name:'③ 倉庫横の路地', approach:[-60,4,6.7], yaw:-Math.PI/2, pad:[-60,4,6.7], exit:[-48.2,4.6,6.7] },
      { id:'east', name:'④ 写真の東の隙間', approach:[18.5,.3,5.3], yaw:-Math.PI/2, pad:[18.5,.3,5.3], exit:[35,0,5.3] },
    ];
    window.skyOldTownSwingCourse = {
      id:'oldtown-swing-routes-v2', oldTown:true, name:'旧市街の鉄棒', bars, routes,
      approach:routes[0].approach, approachYaw:Math.PI, pad:routes[0].pad, exit:routes[0].exit,
      exitBounds:[-32,-25,12,18],
      signs:[
        {text:'① 鉄棒 > 西の屋根',at:[-20.6,2.25,14.5],scale:.65},
        {text:'西：次の屋根 / 北：路地',at:[-26,4.25,12.5],scale:.6},
        {text:'② 2連 > 南の回廊',at:[-35.7,13.3,-11.4],scale:.65},
        {text:'③ 鉄棒 > 庇 > 左右の屋根',at:[-60,5.4,6.7],scale:.6},
        {text:'④ 東の隙間・鉄棒の横道',at:[18.2,1.6,6.3],scale:.6},
      ],
      arrows:[
        {at:[-19.8,.025,16],direction:[-1,0]}, {at:[-21,.425,15],direction:[0,-1]},
        {at:[-20.8,1.225,14],direction:[-1,0]}, {at:[-28,2.825,14],direction:[-1,0]},
        {at:[-29.5,2.825,13],direction:[0,-1]}, {at:[-35.7,11.925,-11.2],direction:[0,1]},
        {at:[-60,4.025,6.7],direction:[1,0]}, {at:[18.8,.325,5.3],direction:[1,0]},
      ],
      instructions:'旧市街の橙色の鉄棒：①西壁→屋根、②西の高層回廊2連、③倉庫横→庇、④東の隙間。屋根側からの逆向き進入も可能。空中で自動につかみ、前へ振れたらジャンプを押し直す。下入力で離す。',
    };
  };
  addEventListener('load',()=>{
    const game=window.__game,sky=window.__skyInternals,course=window.skyOldTownSwingCourse;
    if(!game||!sky||!course)return;
    const card=document.createElement('section');card.id='oldTownSwingPreview';
    card.style.cssText='margin:0 0 16px;padding:12px;border:1px solid #ffb647;border-radius:10px;background:#2c3028;color:#fff4df';
    const title=document.createElement('strong');title.textContent='旧市街・鉄棒ルート';
    const note=document.createElement('p');note.style.cssText='font-size:13px;line-height:1.6;margin:8px 0';
    note.textContent=preview?'入口から試せます。屋根からの逆向きジャンプにも対応。この練習入口からの記録は送信しません。':'①〜④の鉄棒を配置しました。下のリンクで、それぞれの入口から試せます。';
    card.append(title,note);
    for(const route of course.routes){
      const control=document.createElement(preview?'button':'a');control.textContent=route.name;
      control.style.cssText='display:inline-block;margin:4px;padding:8px;color:'+(preview?'#292218':'#ffe0a0');
      if(preview){control.type='button';control.onclick=()=>{game.startGame();game.placeAt({x:route.approach[0],y:route.approach[1],z:route.approach[2],yaw:route.yaw});sky.z.safeT=5;};}
      else control.href='./index.html?oldtown_swing=1&swing_route='+route.id;
      card.append(control);
    }
    (document.getElementById('ovStart')?.querySelector('.plate')||document.getElementById('ovStart'))?.prepend(card);
    if(preview){const n=document.getElementById('recNote');if(n)n.textContent='鉄棒の練習入口：プレイ記録は送信しません。';}
  });
})();
