// A separate geometry, selected from home; uses the same movement/collision code.
(() => {
  if (!new URLSearchParams(location.search).has('practice')) return;
  window.skyPracticeMode = true;
  const sections = [
    {id:'flow',name:'連続コース',at:[-26,2,-16],yaw:-Math.PI/2,floor:2,hint:'前へ走る → 低い壁を乗り越え → 隙間でジャンプ'},
    {id:'slide',name:'スライド',at:[-12,2,-16],yaw:-Math.PI/2,floor:2,hint:'走りながらスライドで低いゲートを抜ける'},
    {id:'mantle',name:'よじ登り',at:[-5.5,2,-16],yaw:-Math.PI/2,floor:2,hint:'高い段差へ走ってジャンプし、縁をつかんでよじ登る'},
    {id:'wallrun',name:'壁走り',at:[3.8,4.4,-17.95],yaw:-Math.PI/2,floor:4.4,hint:'壁沿いに走ってジャンプ → 壁走りで向こうの足場へ'},
    {id:'hook',name:'フック',at:[18,4.4,-16],yaw:-2.75,floor:4.4,hint:'青い輪を向いてフック → 高い足場へ'},
    {id:'zip',name:'ジップライン',at:[23.5,5.2,-1],yaw:Math.PI/2,floor:5.2,hint:'ジャンプでロープにつかまる → 途中でもジャンプで離せる'},
    {id:'walljump',name:'壁蹴り',at:[-20.39,4,-6],yaw:-Math.PI/2,floor:4,hint:'ジャンプ → 壁の近くでもう一度ジャンプで小足場へ'},
    {id:'swing',name:'鉄棒連続',at:[-16.9,5.2,-6],yaw:-Math.PI/2,floor:5.2,hint:'走ってジャンプ → 鉄棒 → 前へ振れたらジャンプを押し直す'},
    {id:'ladder',name:'はしご',at:[9,8,-5.4],yaw:Math.PI,floor:8,hint:'はしごへ前入力 → 上のデッキへ登る'},
    {id:'dash',name:'ダッシュ',at:[9,11.2,6],yaw:Math.PI,floor:11.2,hint:'青いDASHを取って直線を駆け抜ける → ジャンプで下の床へ'},
    {id:'kick',name:'踏みつけ・飛び蹴り',at:[10,0,18],yaw:Math.PI/2,floor:0,hint:'練習相手へジャンプで踏みつけ／空中でジャンプを押して飛び蹴り'},
    {id:'blast',name:'爆破ジャンプ',at:[-12,0,17],yaw:Math.PI/2,floor:0,hint:'赤い缶の上に乗り、缶を撃つ／タップ → 高い戻り足場へ'},
    {id:'jumpgun',name:'ジャンプガン',at:[-27,2,7],yaw:0,floor:2,hint:'金色のJUMPを拾い、発射で高台へ → 左奥の階段で開始地点へ'},
    {id:'loop',name:'周回の戻り道',at:[-30,8,-16],yaw:0,floor:0,hint:'階段を下る → 右へ曲がる → STARTへ戻ってもう一周'},
  ];
  window.skyPracticeCourse = {sections,start:sections[0],dashPositions:[[9,11.2,8]],jumpPositions:[[-27,2,5.8]],wallSpots:[]};
  window.buildSkyCanyon = function({ne,Mh,ld,us,jn}) {
    const add=(id,a,b,type='beam',tier='M')=>{const s=ne(...a,...b,type);s.practice=id;s.canyonTier=tier;return s;};
    add('floor',[-34,-.6,-26],[34,0,26],'slab','G');
    // Colour/rail rhythm makes forward travel legible without dense decoration.
    add('start',[-29,1.6,-19],[-15,2,-13]);
    add('vault',[-21,2,-18.8],[-20.4,2.8,-13.2],'prop');
    add('gap-landing',[-12.6,1.6,-19],[3,2,-13]);
    add('slide-gate',[-10.5,3.15,-18.8],[-8,3.6,-13.2]);
    for(const z of [-18.9,-13.25])add('slide-post',[-10.5,2,z],[-8,3.15,z+.15]);
    add('mantle',[-3,2,-19],[3,4.4,-13]);
    add('run-launch',[3,4,-19],[5.5,4.4,-13]);
    add('run-wall',[3,2,-19.2],[15,8,-18.5],'mono');
    const runWall=jn.at(-1);runWall.wr=true;
    window.skyPracticeCourse.wallSpots=[{at:[9,4.4,-18.5],normal:[0,1]}];
    window.__skyWallRunRoutes=[{at:[9,4.4,-18.5],normal:[0,1],direction:[1,0],name:'練習場の壁走り'}];
    add('run-exit',[13,4,-19],[20.5,4.4,-13]);
    add('hook-deck',[19,4.8,-8],[27,5.2,1]);
    us.push([22,6.6,-5]);
    // One smooth westbound zip joins the wall-kick approach.
    ld([23.5,7.5,-1],[-19.8,6.3,-9.5]);
    add('kick-approach',[-26,3.6,-12],[-19.4,4,-2]);
    window.buildSwingCourse({ne});
    add('ladder-link',[5.2,7.62,-8.2],[10.5,8,-2.4]);
    add('ladder-top',[6.5,10.8,-2.4],[12,11.2,7]);
    Mh(9,-2.4,0,-1,8,11.2,1.4);
    add('dash-run',[6.5,10.8,7],[12,11.2,15]);
    // Landing strip connects targets and the return tools on the ground.
    add('return-pad',[-28,1.6,2],[-19,2,12]);
    const barrel={id:'practice-blast',x:-17,y:0,z:17};
    barrel.block=add('blast-body',[-17.36,0,16.64],[-16.64,1.12,17.36],'prop','G');barrel.block.shape='barrel';
    barrel.cap=add('blast-cap',[-17.7,1.02,16.3],[-16.3,1.12,17.7],'prop','G');
    barrel.step=add('blast-step',[-17.65,0,15.52],[-16.35,.55,16.28],'prop','G');
    window.SKY_CANYON_BLAST_BARRELS=[barrel];
    // The loop can also be walked back without a special move.
    for(let i=0;i<10;i++)add('return-stair',[-28,0,10+i*.6],[-25,2-i*.2,10.6+i*.6]);
    for(let i=0;i<10;i++)add('start-stair',[-28,0,-13+i*.6],[-25,2-i*.2,-12.4+i*.6]);
    // A jump-gun launch has a broad destination; walking remains a fallback.
    add('jumpgun-target',[-31,7.6,-17],[-25,8,1]);
    for(let i=0;i<20;i++){const z0=-17-i*.35,y=8-i*.3;add('loop-stair',[-32,y-.4,z0-.35],[-29,y,z0]);}
    add('loop-bottom',[-32,1.6,-25],[-25,2,-18]);
    us.push([-28,9,1]);
  };
  const finish=window.finishSkyCanyon;
  window.finishSkyCanyon=function(game){finish(game);document.body.dataset.mapId='parkour-playground-v1';};
})();
