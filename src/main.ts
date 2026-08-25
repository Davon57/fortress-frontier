import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import { dispatchCount, dispatchRatio, produce, resolveArrival, resolveClash, winner, type Faction } from "./game/logic";
import { getLevel, levels } from "./game/levels";
import "./style.css";

const W = 1100, H = 620;
const colors: Record<Faction, number> = { player: 0x3978d8, ai: 0xbf3d42, neutral: 0x8d8068 };
interface Fort { x:number; y:number; faction:Faction; soldiers:number; production:number }
interface Point { x:number; y:number }
interface Squad { from:number; to:number; faction:Faction; soldiers:number; phase:number; x:number; y:number; route:Point[]; next:number }
const selectedLevel=Number(new URLSearchParams(location.search).get("level")||"1"), level=getLevel(selectedLevel);
const forts: Fort[] = level.forts.map(f=>({...f}));
const squads: Squad[] = [];
const app = new Application();
await app.init({width:W,height:H,antialias:true,background:"#d8c69b",resolution:Math.min(devicePixelRatio,2)});
document.querySelector<HTMLDivElement>("#app")!.append(app.canvas);
const map = new Container(), hud = new Container(), bg = new Graphics(), actors = new Graphics(), overlay = new Graphics();
map.addChild(bg,actors,overlay); app.stage.addChild(map,hud);
const status = new Text({text:`第 ${level.id} 关：${level.briefing}`,style:new TextStyle({fill:"#4c321e",fontSize:15,fontWeight:"600"})});
const score = new Text({text:"",style:new TextStyle({fill:"#3a271b",fontSize:19,fontWeight:"bold"})});
status.position.set(24,22); score.anchor.set(1,0); score.position.set(W-24,20); hud.addChild(status,score);
let source=-1, pointer={x:0,y:0}, ended=false, aiTimer=1.8, unitLabels:Text[]=[];
const at=(x:number,y:number)=>forts.findIndex(f=>Math.hypot(f.x-x,f.y-y)<43);
function routeFor(from:number,to:number):Point[] {
  const start=forts[from], end=forts[to];
  if(!level.waypoints.length||Math.abs(start.x-end.x)<260) return [{x:start.x,y:start.y},{x:end.x,y:end.y}];
  const node=level.waypoints.reduce((best,candidate)=>Math.hypot(start.x-candidate.x,start.y-candidate.y)+Math.hypot(end.x-candidate.x,end.y-candidate.y)<Math.hypot(start.x-best.x,start.y-best.y)+Math.hypot(end.x-best.x,end.y-best.y)?candidate:best);
  return [{x:start.x,y:start.y},node,{x:end.x,y:end.y}];
}
function order(from:number,to:number,drag:number) {
  if(from===to||forts[from].faction==="neutral") return;
  const soldiers=dispatchCount(forts[from].soldiers,dispatchRatio(drag));
  if(!soldiers) return;
  forts[from].soldiers-=soldiers; const route=routeFor(from,to);
  squads.push({from,to,faction:forts[from].faction,soldiers,phase:Math.random()*Math.PI*2,x:route[0].x,y:route[0].y,route,next:1});
}
function draw() {
  const ground:Record<string,number>={grassland:0x9fb66e,river:0x9fb66e,desert:0xd9b86d,jungle:0x54764a,snow:0xc7d8db,islands:0x82b7b5,volcano:0x513c35,highland:0x80938f,city:0xa88d72,capital:0x91755f};
  bg.clear().rect(0,0,W,H).fill(ground[level.biome]);
  // 远景山脊与羊皮纸般的地形明暗
  bg.poly([0,95,90,48,190,96,288,40,390,92,500,50,610,108,720,42,850,104,960,38,1100,96,1100,0,0,0]).fill(0x708657);
  bg.poly([0,116,90,74,190,116,288,65,390,112,500,78,610,129,720,66,850,122,960,66,1100,118,1100,89,960,38,850,104,720,42,610,108,500,50,390,92,288,40,190,96,90,48,0,95]).fill(0x829c60);
  // 河谷：河流不是行军路径，仅用于环境叙事
  if(level.biome==="river") bg.moveTo(505,-10).bezierCurveTo(450,120,600,172,530,290).bezierCurveTo(465,405,615,476,565,630)
    .lineTo(680,630).bezierCurveTo(740,475,585,396,650,283).bezierCurveTo(720,160,580,115,635,-10).closePath().fill(0x7cb7c1);
  if(level.biome==="river") bg.moveTo(552,-10).bezierCurveTo(510,123,650,181,578,290).bezierCurveTo(510,405,663,473,610,630)
    .stroke({color:0xc5e0d2,width:3,alpha:.6});
  // 两座木桥
  if(level.biome==="river") for(const y of [205,430]){bg.roundRect(485,y,205,18,3).fill(0x785239).stroke({color:0x4f3626,width:2});for(let x=493;x<683;x+=16)bg.rect(x,y+2,3,14).fill(0xc39760);}
  // 农田、石路与村落遗迹
  for(const [x,y] of [[95,490],[180,520],[890,480],[970,440]]){
    bg.roundRect(x,y,74,42,5).fill(0xb2a65f).stroke({color:0x897a45,width:1,alpha:.7});
    for(let r=0;r<3;r++)bg.moveTo(x+8,y+9+r*11).lineTo(x+66,y+9+r*11).stroke({color:0xd5c87a,width:1,alpha:.8});
  }
  bg.moveTo(40,360).bezierCurveTo(230,335,335,385,462,420).stroke({color:0xbea373,width:10,alpha:.75}).moveTo(730,330).bezierCurveTo(835,305,925,275,1070,295).stroke({color:0xbea373,width:10,alpha:.75});
  // 多层树林：阴影、树冠和高光避免重复圆形背景
  const trees=[[65,170],[120,200],[205,278],[250,305],[370,105],[420,130],[755,105],[820,122],[1015,185],[1060,220],[75,580],[150,565],[270,575],[865,560],[960,545],[1020,585],[380,535]];
  for(const [x,y] of trees){bg.ellipse(x+6,y+9,27,16).fill({color:0x465d3d,alpha:.22}).circle(x,y,25).fill(0x607b46).circle(x-12,y+4,17).fill(0x6e8950).circle(x+12,y+5,17).fill(0x58723f).circle(x-6,y-9,13).fill({color:0x91a965,alpha:.55});}
  // 石头、营火与散落草簇
  for(const [x,y] of [[165,365],[310,245],[445,490],[735,500],[936,95],[1020,345]]){bg.ellipse(x,y,12,7).fill(0x7d8066).ellipse(x-3,y-2,7,3).fill(0xb5b28b);}
  actors.clear(); unitLabels.forEach(label=>label.destroy()); unitLabels=[];
  for(const f of forts) {
    const c=colors[f.faction]; actors.circle(f.x,f.y,39).fill(0x5b4937).circle(f.x,f.y,34).fill(c).circle(f.x,f.y,27).fill(0xe3d0a5);
    actors.rect(f.x-3,f.y-44,6,36).fill(0x4a3728).poly([f.x+3,f.y-43,f.x+29,f.y-35,f.x+3,f.y-25]).fill(c);
    actors.roundRect(f.x-23,f.y-11,46,25,3).fill(0x735a42).rect(f.x-17,f.y-18,9,12).fill(0x907151).rect(f.x+8,f.y-18,9,12).fill(0x907151);
    const label=new Text({text:String(Math.floor(f.soldiers)),style:new TextStyle({fill:"#fff4d5",fontSize:16,fontWeight:"bold"})}); label.anchor.set(.5);label.position.set(f.x,f.y+4);hud.addChild(label);unitLabels.push(label);
  }
  for(const s of squads){
    const target=s.route[Math.min(s.next,s.route.length-1)];
    const x=s.x,y=s.y,direction=Math.atan2(target.y-y,target.x-x), count=Math.min(18,Math.max(3,Math.ceil(s.soldiers/4)));
    const forwardX=Math.cos(direction), forwardY=Math.sin(direction), sideX=-forwardY, sideY=forwardX;
    for(let i=0;i<count;i++){const row=Math.floor(i/6),col=i%6,side=(col-2.5)*7,back=row*8,step=Math.sin(s.phase*10+i*.91);
      const px=x+sideX*side-forwardX*back,py=y+sideY*side-forwardY*back+step*.7;
      const point=(forward:number,lateral:number)=>({x:px+forwardX*forward+sideX*lateral,y:py+forwardY*forward+sideY*lateral});
      const head=point(4,0), chest=point(0,0), waist=point(-2.5,0), leftFoot=point(-5.5+step*1.4,1.4), rightFoot=point(-5.5-step*1.4,-1.4);
      const shield=point(-.5,3), shadow=point(-3,0);
      actors.ellipse(shadow.x,shadow.y+3,4.4,1.7).fill({color:0x4a3728,alpha:.22})
        .moveTo(waist.x,waist.y).lineTo(leftFoot.x,leftFoot.y).stroke({color:0x39291f,width:2})
        .moveTo(waist.x,waist.y).lineTo(rightFoot.x,rightFoot.y).stroke({color:0x39291f,width:2})
        .circle(chest.x,chest.y,3.6).fill(0x241b16)
        .circle(chest.x-.7,chest.y-1,3.1).fill(colors[s.faction])
        .circle(shield.x,shield.y,2.4).fill(0xd7bd83).stroke({color:0x6d5136,width:1})
        .circle(head.x,head.y,2.6).fill(0x49372a)
        .circle(head.x,head.y+1,2.2).fill(0xffd8aa)
        .rect(head.x-2.8,head.y-2.6,5.6,1.7).fill(0x5b4634);
    }
  }
  overlay.clear();
  if(source>=0){const A=forts[source],d=Math.hypot(pointer.x-A.x,pointer.y-A.y),p=Math.round(dispatchRatio(d)*100);overlay.moveTo(A.x,A.y).lineTo(pointer.x,pointer.y).stroke({color:colors.player,width:4,alpha:.8}).circle(pointer.x,pointer.y,7).fill(colors.player);status.text=`出兵预览：${p}%（${dispatchCount(A.soldiers,dispatchRatio(d))} 人）`;}
}
function aiMove(){
  const options=forts.map((f,i)=>({f,i})).filter(x=>x.f.faction==="ai"&&x.f.soldiers>18); if(!options.length)return;
  const from=options.sort((a,b)=>b.f.soldiers-a.f.soldiers)[0].i;
  const neutrals=forts.map((f,i)=>({f,i})).filter(x=>x.f.faction==="neutral").map(x=>x.i);
  const targets=neutrals.length
    ? neutrals
    : forts.map((f,i)=>({f,i})).filter(x=>x.i!==from&&x.f.faction==="player").map(x=>x.i);
  if(targets.length) order(from,targets.sort((a,b)=>forts[a].soldiers-forts[b].soldiers)[0],180+Math.random()*110);
}
function update(dt:number) {
  if(ended)return;
  for(let i=0;i<forts.length;i++) forts[i]={...forts[i],...produce(forts[i],dt)};
  for(const s of squads){
    const target=s.route[s.next], dx=target.x-s.x,dy=target.y-s.y,distance=Math.hypot(dx,dy),step=Math.min(distance,dt*54*level.speed);
    if(distance>0){s.x+=dx/distance*step;s.y+=dy/distance*step;}
    if(distance<=step+0.01)s.next+=1;
    s.phase+=dt;
  }
  for(let i=squads.length-1;i>=0;i--){const s=squads[i],enemy=squads.find(o=>o!==s&&o.faction!==s.faction&&Math.hypot(s.x-o.x,s.y-o.y)<28);
    if(enemy){const r=resolveClash(s.soldiers,enemy.soldiers,dt);s.soldiers=r.first;enemy.soldiers=r.second;}
    if(s.soldiers<=0)squads.splice(i,1); else if(s.next>=s.route.length){forts[s.to]={...forts[s.to],...resolveArrival(forts[s.to],s.faction,s.soldiers)};squads.splice(i,1);}
  }
  aiTimer-=dt;if(aiTimer<=0){aiTimer=level.aiDelay+Math.random();aiMove();}
  const won=winner(forts);if(won){ended=true;if(won==="player"){const unlocked=Math.max(Number(localStorage.getItem("fortress-unlocked")||1),Math.min(10,level.id+1));localStorage.setItem("fortress-unlocked",String(unlocked));refreshCampaignButtons();status.text=`${level.name} 胜利！第 ${Math.min(10,level.id+1)} 关已解锁，可点击“下一关”。`;}else status.text="敌军统一了地图，点击重启再战。";}
  score.text=`第 ${level.id} 关 ${level.name} · 蓝军 ${forts.filter(f=>f.faction==="player").length} 座 · 红军 ${forts.filter(f=>f.faction==="ai").length} 座`;
  draw();
}
app.stage.eventMode="static";app.stage.hitArea=app.screen;
app.stage.on("pointerdown",e=>{if(ended)return;const id=at(e.global.x,e.global.y);if(id>=0&&forts[id].faction==="player"){source=id;pointer={x:e.global.x,y:e.global.y};}});
app.stage.on("pointermove",e=>{if(source>=0)pointer={x:e.global.x,y:e.global.y};});
app.stage.on("pointerup",e=>{if(source<0)return;const target=at(e.global.x,e.global.y),A=forts[source];if(target>=0&&target!==source){order(source,target,Math.hypot(e.global.x-A.x,e.global.y-A.y));status.text="部队已出征，敌军也在同时调兵。";}else status.text="命令取消：请拖到一座目标堡垒。";source=-1;});
app.ticker.add(t=>update(t.deltaMS/1000));
const unlocked=Number(localStorage.getItem("fortress-unlocked")||1);
document.body.insertAdjacentHTML("beforeend",`<section class="command-deck"><div class="deck-title">王国争夺 · ${level.name}<span>${level.briefing}</span></div><div class="deck-row">${levels.map(item=>`<button class="level" data-level="${item.id}" ${item.id>unlocked?"disabled":""}>${item.id}. ${item.name}</button>`).join("")}<button id="next-level" ${level.id>=unlocked||level.id===10?"disabled":""}>下一关</button><button id="restart">重启战局</button></div></section>`);
document.querySelectorAll<HTMLButtonElement>(".level").forEach(button=>button.addEventListener("click",()=>location.href=`?level=${button.dataset.level}`));
function refreshCampaignButtons(){
  const currentUnlocked=Number(localStorage.getItem("fortress-unlocked")||1);
  document.querySelectorAll<HTMLButtonElement>(".level").forEach(button=>button.disabled=Number(button.dataset.level)>currentUnlocked);
  const next=document.querySelector<HTMLButtonElement>("#next-level");
  if(next) next.disabled=level.id>=currentUnlocked||level.id===10;
}
document.querySelector("#next-level")!.addEventListener("click",()=>location.href=`?level=${level.id+1}`);
document.querySelector("#restart")!.addEventListener("click",()=>location.reload());
