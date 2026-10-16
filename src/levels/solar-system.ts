import type { Body, Level } from '../game/types';
import { firstLevel } from './first';
import { createBody } from '../game/entities';
import { bodyGravity } from '../physics/gravity';
import { fieldAcceleration } from '../physics/fields';
import { length } from '../physics/vector';
import { seededRandom } from '../world/sectors';
const center={x:900,y:0};
const sun=createBody({id:'sun',kind:'star',radius:100,position:center,response:0.003,gravityResponse:1,
  gravityRadius:6000,gravityStrength:2_400_000,gravitySoftening:100,stabilization:{halfLife:0.9},
  displacementLimit:{center:{...center},radius:60},appearance:{name:'太阳',color:'#ffbe55'},
  stellar:{burnRadius:340,burnPerSecond:80,activationSeconds:3,remnantRadius:32,remnantGravityMultiplier:1.7,remnantResponse:0.35}});
/** Initial circular speed uses the SAME softened/cutoff solar force as the solver.
 * After creation there is no prescribed orbit or position correction: every body
 * receives local gravity, including mutual planet/ship/asteroid perturbations. */
function planet(id:string,name:string,x:number,y:number,radius:number,color:string,ring=false,response=0.18):Body {
  const position={x,y},dx=x-center.x,dy=y-center.y,distance=Math.hypot(dx,dy);
  const acceleration=length(fieldAcceleration(position,center,bodyGravity(sun)));
  const speed=Math.sqrt(acceleration*distance);
  return createBody({id,kind:'planet',position,velocity:{x:-dy/distance*speed,y:dx/distance*speed},radius,
    gravityResponse:1,response,density:3,gravityRadius:Math.max(360,radius*8),
    stabilization:{halfLife:1.2},appearance:{name,color,ring}});
}
const planets=[
  planet('mercury','水星',650,-180,24,'#aaa49d'),
  planet('venus','金星',400,200,37,'#d4af78'),
  planet('earth','地球',-80,170,40,'#62a9de'),
  planet('mars','火星',2100,190,31,'#ce8064'),
  planet('jupiter','木星',2700,-230,82,'#c3a58c',false,0.02),
  planet('saturn','土星',3150,260,68,'#dfc58f',true),
  planet('uranus','天王星',3550,-200,52,'#84d3d6'),
  planet('neptune','海王星',3950,240,50,'#597ddc'),
  planet('pluto','冥王星',4350,-120,23,'#ad9d90'),
];
const random=seededRandom(76127);
const decorations=Array.from({length:100},()=>({position:{x:2280+random()*260,y:(random()-0.5)*1250},radius:1+random()*3,color:'#707988'}));
const pass=(id:string,label:string,x:number,requires?:string[])=>({id,label,requires,target:{position:{x,y:0}},
  condition:{type:'inside_region' as const,entityId:'ark',region:{shape:'rect' as const,bounds:{minX:x,maxX:1e9,minY:-1e9,maxY:1e9}}}});
/** Compressed, initially aligned solar system. All physical bodies exchange locally indexed gravity; initial circular speeds are seeded.
 * Ship gravity is still integrated from the actual moving source positions; no slingshot triggers. */
export const solarSystem:Level={
  id:'solar-exodus',name:'Level 1 · SOLAR EXODUS / 逃离太阳系',width:1100,height:620,seed:76127,shipHealth:100,
  mapBounds:{minX:-600,minY:-1000,maxX:6000,maxY:1000},decorations,
  players:structuredClone(firstLevel.players).map((p,i)=>({...p,position:i?{x:-200,y:140}:{x:60,y:-150}})) as Level['players'],
  bodies:[createBody({id:'ark',kind:'ship',radius:8,position:{x:-180,y:0},velocity:{x:110,y:0}}),
    sun,
    ...planets,
    ...[[-140,90],[100,-190],[40,250]].map(([x,y],i)=>createBody({id:`belt-rock-${i}`,kind:'asteroid',radius:17+i*3,
      position:{x:2400+x,y},velocity:{x:-8-i*2,y:i%2?4:-4},gravityResponse:1,stabilization:{halfLife:1.1},appearance:{name:'小行星',color:'#929ba6'}})),
    createBody({id:'interstellar',kind:'wormhole',radius:210,position:{x:5480,y:0},appearance:{name:'星际转移区',color:'#94e9dc'}}),
  ],
  waves:[{id:'belt-approach',bounds:{minX:2160,maxX:2560,minY:-650,maxY:650},seed:441,count:2}],
  mission:{objectives:[
    pass('earth-depart','地球起航 · 向右出发，双场引导航线',160),
    pass('sun-pass','太阳绕行 · 建议从热区上方通过；实体接触致命',1340,['earth-depart']),
    pass('inner-pass','内行星区域 · 前往火星与小行星带',2150,['sun-pass']),
    pass('belt-pass','小行星带 · 金场可清理来袭碎石',2700,['inner-pass']),
    pass('outer-pass','外行星区域 · 木星、土星、天王星、海王星',4150,['belt-pass']),
    {id:'transfer',label:'到达星际转移区 · 完成太阳系逃逸',requires:['outer-pass'],target:{entityId:'interstellar'},condition:{type:'near_entity',entityId:'ark',targetId:'interstellar'}},
  ],triggers:['sun-pass','inner-pass','belt-pass','outer-pass'].map(id=>({id:'checkpoint-'+id,
    condition:{type:'objective_complete' as const,objectiveId:id},actions:[{type:'checkpoint' as const,id}]}))},
};

export const solarSections={earth:{position:{x:-180,y:0},completed:[]},sun:{position:{x:600,y:-410},completed:['earth-depart']},
  belt:{position:{x:2110,y:-340},completed:['earth-depart','sun-pass']},pluto:{position:{x:4140,y:0},completed:['earth-depart','sun-pass','inner-pass','belt-pass']}};
