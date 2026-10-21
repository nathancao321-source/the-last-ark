import type {Body} from '../game/types';
import type {Camera} from '../camera/camera';
import {isVisible} from '../camera/camera';
import type {Quality} from './spacetime/config';
import {isSolarPlanet,solarPlanetLOD,solarPlanetPixels,solarPlanetWeather} from './solar-planet-material';
import type {SolarPlanet,PlanetSize,PlanetPixels} from './solar-planet-material';

const TAU=Math.PI*2;
interface Material {surface:HTMLCanvasElement;weather?:HTMLCanvasElement;bytes:number}
// Exactly nine supported IDs times three LODs. Never keyed by world position,
// time, body radius or camera: retries and translations reuse the same pixels.
const cache=new Map<string,Material>(),pending=new Set<string>();
let worker:Worker|undefined,workerFailed=false,builds=0,workerMs=0;
export function solarPlanetCacheStats(){return {entries:cache.size,capacity:27,pending:pending.size,builds,workerMs,bytes:[...cache.values()].reduce((n,m)=>n+m.bytes,0)};}
export function clearSolarPlanetCache(){worker?.terminate();worker=undefined;workerFailed=false;cache.clear();pending.clear();builds=0;workerMs=0;}
function install(id:SolarPlanet,size:PlanetSize,pixels:PlanetPixels):Material|undefined {
  const bake=(data:Uint8ClampedArray)=>{const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
    const ctx=canvas.getContext('2d');if(!ctx)return;const image=ctx.createImageData(size,size);image.data.set(data);ctx.putImageData(image,0,0);return canvas;};
  const surface=bake(pixels.surface);if(!surface)return;
  const weather=pixels.weather?bake(pixels.weather):undefined;
  const material={surface,weather,bytes:size*size*4*(weather?2:1)};cache.set(id+':'+size,material);builds++;return material;
}
function material(id:SolarPlanet,size:PlanetSize):Material|undefined {
  if(typeof document==='undefined')return;
  const key=id+':'+size,hit=cache.get(key);if(hit)return hit;
  // Immediate, tiny material while the detailed worker runs; no blank planet.
  const base=cache.get(id+':48')??install(id,48,solarPlanetPixels(id,48));
  if(size===48||workerFailed||typeof Worker==='undefined')return base;
  if(!worker){try{
    worker=new Worker(new URL('./solar-planet-worker.ts',import.meta.url),{type:'module'});
    worker.onmessage=(event:MessageEvent<PlanetPixels&{id:SolarPlanet;size:PlanetSize;ms:number}>)=>{
      const d=event.data;pending.delete(d.id+':'+d.size);install(d.id,d.size,d);workerMs+=d.ms;
    };
    worker.onerror=()=>{worker?.terminate();worker=undefined;workerFailed=true;pending.clear();};
  }catch{workerFailed=true;return base;}}
  if(!pending.has(key)){pending.add(key);worker.postMessage({id,size});}
  return base;
}
/** Ring particles are cosmetic. Geometry is normalized to the same origin as
 * the disc. Canvas y grows down: rear PI..2PI, foreground 0..PI. */
function ringHalf(ctx:CanvasRenderingContext2D,front:boolean,detail:boolean):void {
  ctx.save();ctx.rotate(-.18);
  const count=detail?34:12;
  for(let i=0;i<count;i++){
    const rr=1.19+i/(count-1)*.74;if(rr>1.65&&rr<1.72)continue;
    const inner=rr<1.34,outer=rr>1.72;
    ctx.strokeStyle=inner?'#918675':outer?'#b4a48a':'#d7c9aa';
    ctx.globalAlpha=(front?.83:.61)*(inner?.35:outer?.7:1)*(i%4===0?.74:1);
    ctx.lineWidth=.74/(count-1)*.87;ctx.beginPath();
    ctx.ellipse(0,0,rr,rr*.32,0,front?0:Math.PI,front?Math.PI:TAU);ctx.stroke();
  }
  ctx.restore();
}
export function solarPlanetExtent(body:Readonly<Body>):number {return body.radius*(body.id==='saturn'&&body.appearance?.ring?1.96:1);}

/** Called in world space, then draw everything around (0,0), inside the existing
 * camera transform. Returns false only for a non-solar planet, allowing the
 * existing tutorial/generic artwork to remain the fallback. */
export function drawSolarPlanet(ctx:CanvasRenderingContext2D,body:Readonly<Body>,time:number,camera:Readonly<Camera>,quality:Quality):boolean {
  if(!isSolarPlanet(body.id))return false;
  if(quality==='off'||body.kind!=='planet'||body.layer==='hidden'||body.spawnPending||body.radius<=0||!isVisible(camera,body.position,solarPlanetExtent(body)))return true;
  const r=body.radius,screenRadius=r*camera.zoom,ring=body.id==='saturn'&&body.appearance?.ring;
  ctx.save();ctx.translate(body.position.x,body.position.y);ctx.scale(r,r);
  if(screenRadius<3){ctx.fillStyle=body.appearance?.color??'#8999ab';ctx.beginPath();ctx.arc(0,0,1,0,TAU);ctx.fill();ctx.restore();return true;}
  if(ring)ringHalf(ctx,false,screenRadius>=28&&quality!=='low');
  const painted=material(body.id,solarPlanetLOD(screenRadius,quality));
  ctx.save();ctx.beginPath();ctx.arc(0,0,1,0,TAU);ctx.clip();
  if(painted){ctx.drawImage(painted.surface,-1,-1,2,2);
    if(painted.weather){const motion=solarPlanetWeather(body.id,time);ctx.globalAlpha=motion.alpha;
      ctx.drawImage(painted.weather,-1+motion.x,-1+motion.y,2,2);}
  }else{ctx.fillStyle=body.appearance?.color??'#8999ab';ctx.fill();}
  ctx.restore();
  if(ring){
    // Shadow falls on the globe under the foreground ring; clipped to radius.
    ctx.save();ctx.beginPath();ctx.arc(0,0,1,0,TAU);ctx.clip();ctx.rotate(-.18);
    ctx.strokeStyle='#211b1638';ctx.lineWidth=.12;ctx.beginPath();ctx.ellipse(0,.055,1.34,.43,0,0,Math.PI);ctx.stroke();ctx.restore();
    ringHalf(ctx,true,screenRadius>=28&&quality!=='low');
  }
  ctx.restore();
  if(ring&&screenRadius>=6){ctx.save();ctx.fillStyle='#b7b3a8';ctx.textAlign='center';ctx.font=`${10/camera.zoom}px system-ui`;
    ctx.fillText('装饰星环 · 无碰撞',body.position.x,body.position.y+r+15/camera.zoom);ctx.restore();}
  return true;
}
