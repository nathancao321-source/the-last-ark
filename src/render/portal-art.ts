import type {Body} from '../game/types';
import type {Quality} from './spacetime/config';
import {celestialMaterial} from './celestial-cache';
import {hash} from './spacetime/noise';
import {ASTRO} from './palette';
const TAU=Math.PI*2;
/** Falling material remains inside the real entrance radius. No scene writes. */
export function portalParticle(index:number,time:number,radius:number){
 const age=(time*(.13+hash(index,42)*.08)+hash(index,17))%1;
 const r=radius*(1-age)**1.3,a=hash(index,81)*TAU+age*2.8;
 return {x:Math.cos(a)*r,y:Math.sin(a)*r,alpha:Math.sin(age*Math.PI)**2};
}
export function drawPortalArt(ctx:CanvasRenderingContext2D,body:Body,time:number,quality:Quality,approach:number):void {
 const r=body.radius,material=celestialMaterial('portal');ctx.save();ctx.translate(body.position.x,body.position.y);
 ctx.fillStyle=ASTRO.portalVoid;ctx.beginPath();ctx.arc(0,0,r*.9,0,TAU);ctx.fill();
 if(material.ready){ctx.drawImage(material.canvas,-r*1.45,-r*1.45,r*2.9,r*2.9);
  ctx.save();ctx.beginPath();ctx.arc(0,0,r*.88,0,TAU);ctx.clip();
  // Two continuous inward texture flows crossfade; no whole-rim rotation.
  for(let n=0;n<2;n++){const phase=(time*.12+n*.5)%1,scale=1.6-phase;
   ctx.save();ctx.rotate(time*.035+n*.7);ctx.globalAlpha=Math.sin(phase*Math.PI)**2*.32;
   ctx.drawImage(material.canvas,-r*scale,-r*scale,r*scale*2,r*scale*2);ctx.restore();}ctx.restore();
 }
 ctx.strokeStyle=ASTRO.portal;ctx.lineCap='round';
 const count=quality==='high'?42:quality==='medium'?24:10;
 for(let n=0;n<count;n++){const p=portalParticle(n,time,r),next=portalParticle(n,time+.09,r);
  ctx.globalAlpha=p.alpha*(.3+approach*.2);ctx.lineWidth=r*.009;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(next.x,next.y);ctx.stroke();}
 ctx.restore();
}
