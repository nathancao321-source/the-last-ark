import type {Body} from '../game/types';
import type {Camera} from '../camera/camera';
import type {Quality} from './spacetime/config';
import {celestialMaterial} from './celestial-cache';
import {hash} from './spacetime/noise';
import {ASTRO} from './palette';
const TAU=Math.PI*2;
export function solarActivity(time:number,index:number):number {
 const period=11+hash(index,19)*19,start=hash(index,12)*period,t=(time+start)%period;
 return t<3.2?Math.sin(t/3.2*Math.PI)**4:0;
}
/** Texture carries the surface; bounded curves are attached plasma, never rings. */
export function drawStellarArt(ctx:CanvasRenderingContext2D,body:Body,time:number,camera:Camera,quality:Quality):void {
 const cold=body.stellarState?.status==='neutron',progress=Math.min(1,(body.stellarState?.blueSeconds??0)/(body.stellar?.activationSeconds??3)),activity=1+progress*1.4;
 const radius=body.radius,r=radius*(cold?1:1-progress*.3),{x,y}=body.position;
 const surface=celestialMaterial(cold?'neutron':'sun'),corona=celestialMaterial(cold?'cold-corona':'corona');
 ctx.save();ctx.translate(x,y);
 if(corona.ready){ctx.globalAlpha=.88+.035*Math.sin(time*.43);ctx.drawImage(corona.canvas,-r*2.15,-r*2.15,r*4.3,r*4.3);}
 if(!cold&&progress>0&&corona.ready){
  // Inward travelling coronal sheets precede the existing physical transition.
  for(let n=0;n<2;n++){const phase=(time*.55+n*.5)%1,s=r*(1.6-.55*phase);ctx.globalAlpha=Math.sin(phase*Math.PI)**2*progress*.42;ctx.drawImage(corona.canvas,-s*2.15,-s*2.15,s*4.3,s*4.3);}
 }
 // The actual stellar edge stays visible even while its surface contracts.
 ctx.fillStyle=cold?ASTRO.coldBase:ASTRO.sunBase;ctx.beginPath();ctx.arc(0,0,radius,0,TAU);ctx.fill();
 if(surface.ready){ctx.globalAlpha=1;ctx.drawImage(surface.canvas,-r,-r,r*2,r*2);ctx.save();ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.clip();ctx.globalAlpha=.065;ctx.drawImage(surface.canvas,-r+Math.sin(time*.07)*r*.025,-r+Math.cos(time*.06)*r*.02,r*2,r*2);ctx.restore();}
 if(!cold&&quality!=='low'&&r*camera.zoom>18){
  const count=quality==='high'?7:4;
  for(let n=0;n<count;n++){const a=hash(n,33)*TAU,life=.5+.5*Math.sin(time*(.11+hash(n,34)*.07)+n*2),flare=solarActivity(time,n),height=r*(.12+.2*life+.16*flare)*activity;
   ctx.save();ctx.rotate(a);ctx.lineCap='round';
   for(let layer=3;layer>=0;layer--){ctx.globalAlpha=(layer===0?.7:.09)*( .6+.4*life);ctx.strokeStyle=layer===0?ASTRO.plasmaHot:ASTRO.plasmaWarm;ctx.lineWidth=r*(.008+layer*.019);ctx.beginPath();ctx.moveTo(r*.97,-r*.1);ctx.bezierCurveTo(r+height,-r*.28,r+height*.8,r*.27,r*.97,r*.14);ctx.stroke();}
   if(flare>0){ctx.globalAlpha=flare*.5;ctx.fillStyle=ASTRO.plasmaHot;ctx.beginPath();ctx.ellipse(r*.9,0,r*.085,r*.035,0,0,TAU);ctx.fill();}
   ctx.restore();
  }
 }
 ctx.restore();
}
