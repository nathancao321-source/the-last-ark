import type {Vec2} from '../../physics/vector';
import type {Camera} from '../../camera/camera';
import {worldToScreen} from '../../camera/camera';
import {ACCRETION} from '../accretion-model';
export interface LensSource {position:Readonly<Vec2>;coreRadius:number;influenceRadius:number;strength:number}
const smooth=(t:number)=>{const u=Math.max(0,Math.min(1,t));return u*u*(3-2*u);};
/** Monotone radial light map; positive radius derivative prevents folds/NaNs.
 * Compact C1 support means no discontinuity at the influence boundary. */
function projectedRadius(r:number,lens:LensSource):number {
 const core=Math.max(1,lens.coreRadius),range=Math.max(core*6,lens.influenceRadius);
 if(r>=range)return r;
 return r+Math.max(0,Math.min(1.8,lens.strength))*core*(1-Math.exp(-r/(core*.45)))*(1-smooth(r/range));
}
export function lensProject(world:Readonly<Vec2>,lens:LensSource):Vec2 {
 const x=world.x-lens.position.x,y=world.y-lens.position.y,r=Math.hypot(x,y);
 if(r<1e-9)return {...world};const scale=projectedRadius(r,lens)/r;
 return {x:lens.position.x+x*scale,y:lens.position.y+y*scale};
}
export function lensDisplacement(world:Readonly<Vec2>,lens:LensSource):Vec2 {
 const p=lensProject(world,lens);return {x:p.x-world.x,y:p.y-world.y};
}
/** Exact inverse of the same forward star projection. Evaluated by the worker
 * only when a world texture chunk is missing, never for every frame. */
export function lensSample(world:Readonly<Vec2>,lens:LensSource):Vec2 {
 const x=world.x-lens.position.x,y=world.y-lens.position.y,r=Math.hypot(x,y);
 if(r<1e-9||r>=Math.max(lens.coreRadius*6,lens.influenceRadius))return {...world};
 let lo=0,hi=r;
 for(let i=0;i<20;i++){const mid=(lo+hi)*.5;if(projectedRadius(mid,lens)>r)hi=mid;else lo=mid;}
 const scale=(lo+hi)*.5/r;return {x:lens.position.x+x*scale,y:lens.position.y+y*scale};
}
export function lensWeight(world:Readonly<Vec2>,lens:LensSource):number {
 return 1-smooth(Math.hypot(world.x-lens.position.x,world.y-lens.position.y)/Math.max(lens.coreRadius*6,lens.influenceRadius));
}
/** Screen-space overlay: model center, fatal core, accretion extent, support,
 * and a projected world lattice, with constant-pixel labels and strokes. */
export function drawLensDebug(ctx:CanvasRenderingContext2D,c:Camera,lens:LensSource):void {
 const center=worldToScreen(c,lens.position),r=lens.influenceRadius;ctx.save();ctx.lineWidth=1;ctx.font='11px monospace';
 for(const [radius,color]of [[lens.coreRadius,'#ff5eae'],[lens.coreRadius*ACCRETION.outer,'#ffd36a'],[r,'#d981ff']] as const){ctx.strokeStyle=color;ctx.setLineDash([5,5]);ctx.beginPath();ctx.arc(center.x,center.y,radius*c.zoom,0,Math.PI*2);ctx.stroke();}
 ctx.setLineDash([]);ctx.strokeStyle='#bc9fe94d';
 for(const axis of [0,1])for(let row=-5;row<=5;row++){
  ctx.beginPath();for(let n=0;n<=60;n++){
   const u=(n/30-1)*r,v=row*r/5,p=lensProject({x:lens.position.x+(axis?v:u),y:lens.position.y+(axis?u:v)},lens),s=worldToScreen(c,p);
   if(n===0)ctx.moveTo(s.x,s.y);else ctx.lineTo(s.x,s.y);
  }ctx.stroke();
 }
 ctx.strokeStyle='#ffffff';ctx.beginPath();ctx.moveTo(center.x-8,center.y);ctx.lineTo(center.x+8,center.y);ctx.moveTo(center.x,center.y-8);ctx.lineTo(center.x,center.y+8);ctx.stroke();
 ctx.fillStyle='#f4dcff';ctx.fillText('lens O=('+lens.position.x+','+lens.position.y+') R='+r+' core='+lens.coreRadius,center.x+12,center.y-12);ctx.restore();
}
