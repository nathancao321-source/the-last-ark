import type {Body} from '../game/types';
import type {Quality} from './spacetime/config';
import {prepareAccretion} from './accretion-cache';
import {ACCRETION,accretionRate,rearHeight} from './accretion-model';
import type {Camera} from '../camera/camera';
import {ASTRO} from './palette';
const TAU=Math.PI*2;
/** Direct, bent and bound inner images sample the same advected polar atlas. */
export function drawBlackHoleArt(ctx:CanvasRenderingContext2D,body:Body,time:number,_quality:Quality):void {
 const r=body.captureRadius??body.radius,material=prepareAccretion(time);ctx.save();ctx.translate(body.position.x,body.position.y);
 // Small symmetric material bloom, not a screen-filling gradient or white veil.
 if(_quality!=='low'){ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=.055;
  for(const layer of material.surfaces)for(const offset of [-.023,.023])ctx.drawImage(layer.canvas,-r*ACCRETION.extentX,-r*ACCRETION.extentY+offset*r,r*ACCRETION.extentX*2,r*ACCRETION.extentY*2);ctx.restore();}
 for(const layer of material.surfaces)ctx.drawImage(layer.canvas,-r*ACCRETION.extentX,-r*ACCRETION.extentY,r*ACCRETION.extentX*2,r*ACCRETION.extentY*2);
 // Absolute black is the final layer and exactly matches the fatal core.
 ctx.globalAlpha=1;ctx.fillStyle=ASTRO.void;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();ctx.restore();
}
/** DEV-only layer origins and physical-radius comparison. No gameplay writes. */
export function drawAccretionDebug(ctx:CanvasRenderingContext2D,body:Body,camera:Camera):void {
 const r=body.captureRadius??body.radius;ctx.save();ctx.translate(body.position.x,body.position.y);ctx.lineWidth=1/camera.zoom;ctx.font=`${11/camera.zoom}px monospace`;
 const colors=['#80ffde','#ffd36a','#ed9fff'];
 for(const [i,name]of ['disc','rear','rim'].entries()){const h=(8+i*5)/camera.zoom;ctx.strokeStyle=colors[i];ctx.beginPath();ctx.moveTo(-h,0);ctx.lineTo(h,0);ctx.moveTo(0,-h);ctx.lineTo(0,h);ctx.stroke();ctx.fillStyle=colors[i];ctx.fillText(`${name} O=(${body.position.x},${body.position.y})`,r*1.65,(-1.6+i*.19)*r);}
 ctx.setLineDash([4/camera.zoom,4/camera.zoom]);
 for(const radius of [1,ACCRETION.inner,ACCRETION.outer]){ctx.strokeStyle=radius===1?'#ff62d6':'#80ffde';ctx.beginPath();ctx.arc(0,0,r*radius,0,TAU);ctx.stroke();}
 for(const radius of [ACCRETION.inner,2.4,ACCRETION.outer]){ctx.strokeStyle='#ffd36a';ctx.beginPath();for(let n=0;n<=120;n++){const x=-radius+n/120*radius*2,y=-rearHeight(x,radius)-x*.055;if(n===0)ctx.moveTo(x*r,y*r);else ctx.lineTo(x*r,y*r);}ctx.stroke();}
 ctx.setLineDash([]);ctx.fillStyle='#ffffff';ctx.fillText(`capture=${r} inner=${(r*ACCRETION.inner).toFixed(2)} outer=${r*ACCRETION.outer}`,r*1.65,-r*.9);ctx.fillText(`inner ${(accretionRate(ACCRETION.inner)*180/Math.PI).toFixed(1)} deg/s / outer ${(accretionRate(ACCRETION.outer)*180/Math.PI).toFixed(1)} deg/s`,r*1.65,-r*.71);ctx.restore();
}
