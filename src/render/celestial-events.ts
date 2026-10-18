import type {GameState} from '../game/types';
import type {Vec2} from '../physics/vector';
import type {VisualState} from './spacetime/model';
import {celestialMaterial} from './celestial-cache';
import {ASTRO} from './palette';
export interface CelestialEvents {
 stars:Record<string,{status:string;radius:number;origin:Vec2;changedAt?:number;fromRadius?:number}>;
 entry?:{origin:Vec2;radius:number;age:number};entered:boolean;
 eruption?:{origin:Vec2;radius:number;at:number};
}
/** Read simulation transitions; never write a body, scene or collision property. */
export function updateCelestialVisuals(v:VisualState,game:GameState,dt:number):void {
 const state=v.celestial??={stars:{},entered:false};
 const wave=game.hazards?.wave;
 if(wave&&!state.eruption)state.eruption={origin:{...wave.origin},radius:wave.radius0,at:wave.launchedAt};
 for(const body of game.bodies)if(body.stellar){
  const status=body.stellarState?.status??'star',old=state.stars[body.id];
  if(!old)state.stars[body.id]={status,radius:body.radius,origin:{...body.position}};
  else {if(old.status!==status){old.changedAt=game.elapsed;old.fromRadius=old.radius;old.status=status;}old.radius=body.radius;old.origin={...body.position};}
 }
 const ship=game.bodies.find(b=>b.kind==='ship')!;
 v.portals=game.bodies.filter(b=>b.kind==='wormhole'&&b.layer!=='hidden').map(b=>({origin:{...b.position},radius:b.radius,approach:Math.max(0,1-Math.hypot(ship.position.x-b.position.x,ship.position.y-b.position.y)/(b.radius*4))}));
 if(game.phase==='completed'&&!state.entered){
  const portal=game.bodies.find(b=>b.kind==='wormhole'&&Math.hypot(ship.position.x-b.position.x,ship.position.y-b.position.y)<=b.radius+ship.radius);
  if(portal)state.entry={origin:{...portal.position},radius:portal.radius,age:0};state.entered=true;
 }
 // A terminal entry event may only decay. Paused/ready cannot advance it.
 if(state.entry&&game.phase==='completed')state.entry.age=Math.min(.7,state.entry.age+Math.max(0,Math.min(.1,dt)));
}
export function drawCelestialEvents(ctx:CanvasRenderingContext2D,v:VisualState,time:number):void {
 const state=v.celestial;if(!state)return;
 const eruption=state.eruption;
 if(eruption){const age=time-eruption.at;if(age>=0&&age<1.6){
  const m=celestialMaterial('corona'),u=age/1.6,r=eruption.radius*(1+u*.7);
  if(m.ready){ctx.save();ctx.globalAlpha=Math.sin(Math.PI*u)**.6*.8;ctx.drawImage(m.canvas,eruption.origin.x-r*2.15,eruption.origin.y-r*2.15,r*4.3,r*4.3);ctx.restore();}
 }}
 for(const star of Object.values(state.stars))if(star.changedAt!==undefined&&star.fromRadius){
  const age=time-star.changedAt;if(age<0||age>3.2)continue;
  const cold=star.status==='neutron',m=celestialMaterial(cold?'cold-corona':'corona'),u=age/3.2;
  ctx.save();ctx.translate(star.origin.x,star.origin.y);
  if(m.ready){const r=star.fromRadius*(1+u*1.4);ctx.globalAlpha=Math.sin(Math.PI*u)**.7*.68;ctx.drawImage(m.canvas,-r*2.15,-r*2.15,r*4.3,r*4.3);}
  ctx.restore();
 }
 const entry=state.entry;if(entry&&entry.age<.7){
  const u=entry.age/.7,r=entry.radius*(1-u)**2,m=celestialMaterial('portal');
  ctx.save();ctx.translate(entry.origin.x,entry.origin.y);ctx.globalAlpha=(1-u)*.8;
  if(m.ready)ctx.drawImage(m.canvas,-r*1.45,-r*1.45,r*2.9,r*2.9);
  ctx.fillStyle=ASTRO.portalVoid;ctx.globalAlpha=Math.sin(u*Math.PI)*.5;ctx.beginPath();ctx.arc(0,0,entry.radius*(1-u),0,Math.PI*2);ctx.fill();ctx.restore();
 }
}
