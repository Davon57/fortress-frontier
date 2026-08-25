import type { Faction } from "./logic";

export interface LevelFortress { x:number; y:number; faction:Faction; soldiers:number; production:number }
export interface Level { id:number; name:string; biome:string; briefing:string; forts:LevelFortress[]; aiDelay:number; waypoints:{x:number;y:number}[]; speed:number; }

const layout = (count:number, player:number, ai:number):LevelFortress[] => {
  const left=[[150,165],[260,430],[150,470],[270,155]];
  const middle=[[510,155],[590,290],[500,440],[650,465],[690,130],[430,300]];
  const right=left.map(([x,y])=>[1100-x,y]);
  const make=(point:number[],faction:Faction,index:number):LevelFortress=>({
    x:point[0],y:point[1],faction,soldiers:faction==="neutral"?22+index*2:36,production:faction==="neutral"?0:1,
  });
  const neutral=count-player-ai;
  return [
    ...left.slice(0,player).map((point,index)=>make(point,"player",index)),
    ...middle.slice(0,neutral).map((point,index)=>make(point,"neutral",index)),
    ...right.slice(0,ai).map((point,index)=>make(point,"ai",index)),
  ];
};
const specs:[string,string,string,number,number,number,{x:number;y:number}[],number][]=[
  ["边境草原","grassland","双方各两座堡垒，学习拖拽派兵与占领。",6,2,2,[],1],
  ["河谷要塞","river","跨河必须经由木桥。",8,2,2,[{x:588,y:214},{x:590,y:439}],1],
  ["沙漠绿洲","desert","沙丘封路，军团经绿洲补给。",8,2,2,[{x:550,y:310}],.72],
  ["雨林遗迹","jungle","密林封锁，遗迹通道是唯一近路。",10,2,2,[{x:500,y:220},{x:620,y:400}],.82],
  ["雪原关隘","snow","冰湖阻隔，只能翻越山口。",10,2,2,[{x:550,y:170},{x:560,y:450}],.75],
  ["群岛海峡","islands","海峡阻隔，必须通过渡口。",10,3,3,[{x:520,y:300}],.78],
  ["火山裂谷","volcano","熔岩裂谷迫使军团走安全石桥。",10,3,3,[{x:550,y:410}],.8],
  ["高原风暴","highland","山脊绕行，风暴减慢增援。",12,3,3,[{x:480,y:250},{x:650,y:350}],.68],
  ["古城围攻","city","城墙阻挡，只能从城门缺口进入。",12,3,3,[{x:550,y:320}],.84],
  ["王都决战","capital","王都广场是多线战场的必经核心。",12,4,4,[{x:500,y:220},{x:600,y:400}],.8],
];
export const levels:Level[]=specs.map(([name,biome,briefing,count,player,ai,waypoints,speed],i)=>({id:i+1,name,biome,briefing,forts:layout(count,player,ai),waypoints,speed,aiDelay:Math.max(.72,1.8-i*.11)}));
export const getLevel=(id:number)=>levels[Math.max(0,Math.min(levels.length-1,id-1))];
