import type {Body} from '../game/types';
import type {Camera} from '../camera/camera';
import {isVisible} from '../camera/camera';
import type {Quality} from './spacetime/config';
import {fbm, noise, hash} from './spacetime/noise';

const TAU=Math.PI*2;
const CACHE_LIMIT=18;
const COLOR={lit:'#dbe5eaff',dark:'#10141fff',ring:'#bca98aff',ringLight:'#e5d8baff',
  atmosphere:'#b2dbf822',transparent:'#9bc5eb00',storm:'#f3ddba',stormShade:'#735b4d',iceCloud:'#d5f5ff'} as const;

/** Material names are visual descriptors, never new physical entity kinds. */
export interface EndlessPlanetDescriptor {
  readonly seed:number;
  readonly material:'rocky'|'gas'|'ice';
  readonly color:string;
  readonly rings:boolean;
  readonly ringTilt:number;
  readonly ringOuterRadius:number;
  readonly ringLabel:'装饰星环 · 无碰撞';
}
function idSeed(id:string):number {let seed=2166136261;for(let i=0;i<id.length;i++)seed=Math.imul(seed^id.charCodeAt(i),16777619);return seed>>>0;}

/** Stable across sector unload/reload, origin rebasing and camera changes. */
export function describeEndlessPlanet(body:Readonly<Body>):EndlessPlanetDescriptor {
  const seed=idSeed(body.id),choice=hash(seed,17);
  const material=body.radius<25?'rocky':body.radius>=31&&choice<.68?'gas':choice>.39?'ice':'rocky';
  const rings=material==='gas'&&body.radius>=32&&hash(seed,28)<.42;
  return {seed,material,color:body.appearance?.color??'#9aafc6',rings,ringTilt:-.3+hash(seed,73)*.3,
    ringOuterRadius:rings?body.radius*(1.65+hash(seed,65)*.24):body.radius,ringLabel:'装饰星环 · 无碰撞'};
}

/** The existing world upper-left lighting contract, independent of stars/time. */
export function endlessPlanetLight(x:number,y:number):number {
  const z=Math.sqrt(Math.max(0,1-x*x-y*y));
  return .15+.85*Math.max(0,-.43*x-.54*y+.72*z);
}
function rgb(color:string):readonly [number,number,number] {
  const hex=color.replace('#','');
  if(!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex))return [154,175,198];
  return [parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16)];
}
const clamp=(value:number,min=0,max=1)=>Math.max(min,Math.min(max,value));

/** Pure, precomputed sphere texture. No random calls or DOM needed by this path. */
export function endlessPlanetPixels(desc:EndlessPlanetDescriptor,size:number):Uint8ClampedArray {
  const pixels=new Uint8ClampedArray(size*size*4),source=rgb(desc.color),seed=desc.seed;
  const base=desc.material==='ice'?source.map((channel,i)=>channel*.3+[105,178,214][i]*.7):source;
  const craters=Array.from({length:6},(_,i)=>({x:(hash(seed,i+2)-.5)*1.4,y:(hash(seed,i+18)-.5)*1.4,r:.045+hash(seed,i+31)*.14}));
  for(let py=0;py<size;py++)for(let px=0;px<size;px++){
    const x=(px+.5)*2/size-1,y=(py+.5)*2/size-1,rr=x*x+y*y;if(rr>=1)continue;
    const z=Math.sqrt(1-rr),longitude=Math.atan2(x,z),latitude=Math.asin(y);
    const cloud=fbm(longitude*3+7,latitude*5+3,3,seed),fine=noise(longitude*30,latitude*34,seed+42);
    let brightness=.8,cream=0;
    if(desc.material==='gas'){
      const belt=Math.sin(latitude*29+cloud*3.2),filament=Math.sin(latitude*105+cloud*5.5+longitude*.7);
      brightness=.72+.23*belt+.09*filament+.13*cloud;cream=.12+.19*Math.max(0,belt);
      const sx=(longitude-(hash(seed,44)-.5)*1.4)/.26,sy=(latitude-(hash(seed,45)-.5)*.8)/.1;
      const vortex=Math.exp(-(sx*sx+sy*sy)*1.7);brightness-=vortex*.28;cream+=vortex*.13;
    }else if(desc.material==='ice'){
      brightness=.84+.11*cloud+.055*Math.sin(latitude*15+cloud*2)+.035*fine;cream=.15+.12*cloud;
    }else{
      const terrain=fbm(longitude*7+cloud,latitude*7-cloud,4,seed+112);
      brightness=.48+.55*terrain+.1*fine;cream=.08+clamp(terrain-.58)*.4;
      for(const crater of craters){const d=Math.hypot(x-crater.x,y-crater.y)/crater.r;
        if(d<1.2){brightness-=Math.exp(-d*d*3)*.16;brightness+=Math.exp(-(((d-.94)*11)**2))*.09;}
      }
    }
    const light=endlessPlanetLight(x,y),i=(py*size+px)*4;
    for(let c=0;c<3;c++)pixels[i+c]=clamp((base[c]*(1-cream)+[233,224,202][c]*cream)*brightness*light,0,255);
    pixels[i+3]=255*clamp((1-Math.sqrt(rr))*size*.6);
  }
  return pixels;
}

interface PlanetMaterial {canvas:HTMLCanvasElement;bytes:number}
const materials=new Map<string,PlanetMaterial>();
let builds=0,hits=0;
export function endlessPlanetCacheStats(){return {entries:materials.size,capacity:CACHE_LIMIT,bytes:[...materials.values()].reduce((sum,m)=>sum+m.bytes,0),builds,hits};}
export function clearEndlessPlanetCache():void {materials.clear();builds=0;hits=0;}
function material(desc:EndlessPlanetDescriptor,size:number):PlanetMaterial|undefined {
  const key=desc.seed+':'+desc.material+':'+desc.color+':'+size,old=materials.get(key);
  if(old){materials.delete(key);materials.set(key,old);hits++;return old;}
  if(typeof document==='undefined')return;
  const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const image=ctx.createImageData(size,size);image.data.set(endlessPlanetPixels(desc,size));ctx.putImageData(image,0,0);
  const entry={canvas,bytes:size*size*4};
  if(materials.size>=CACHE_LIMIT)materials.delete(materials.keys().next().value!);
  materials.set(key,entry);builds++;return entry;
}

/** Bounded analytic weather: evaluating the same elapsed time freezes exactly. */
export function endlessPlanetWeather(desc:EndlessPlanetDescriptor,time:number){
  const longitude=hash(desc.seed,99)*TAU+Math.max(0,time)*.035;
  return {x:Math.sin(longitude)*.72,y:(hash(desc.seed,51)-.5)*.8,
    visibility:clamp(Math.cos(longitude)*3),activity:.085+.025*Math.sin(Math.max(0,time)*.13+hash(desc.seed,81)*TAU)};
}

function ringHalf(ctx:CanvasRenderingContext2D,desc:EndlessPlanetDescriptor,r:number,front:boolean):void {
  ctx.save();ctx.rotate(desc.ringTilt);
  for(let i=0;i<6;i++){
    const radius=r*(1.22+(desc.ringOuterRadius/r-1.22)*i/5);
    ctx.globalAlpha=(front?.5:.34)*(i===3?.26:1);ctx.strokeStyle=i%2?COLOR.ringLight:COLOR.ring;
    ctx.lineWidth=r*(i===1?.09:.055);ctx.beginPath();
    // Canvas y grows down: upper/back half first, lower/front half last.
    ctx.ellipse(0,0,radius,radius*.3,0,front?0:Math.PI,front?Math.PI:TAU);ctx.stroke();
  }
  ctx.restore();
}

/** Draw inside the existing world transform. Position/radius are read-only.
 * Rings are decorative, labelled explicitly, and never expand collision bounds. */
export function drawEndlessPlanet(ctx:CanvasRenderingContext2D,body:Readonly<Body>,time:number,camera:Readonly<Camera>,quality:Quality):void {
  if(quality==='off'||body.kind!=='planet'||body.layer==='hidden'||body.spawnPending||body.radius<=0)return;
  const desc=describeEndlessPlanet(body),r=body.radius,screenRadius=r*camera.zoom;
  if(!isVisible(camera,body.position,desc.ringOuterRadius))return;
  ctx.save();ctx.translate(body.position.x,body.position.y);
  if(screenRadius<6){ctx.fillStyle=desc.color;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();ctx.restore();return;}
  const detailed=screenRadius>=18&&quality!=='low',rings=desc.rings&&detailed;
  if(rings)ringHalf(ctx,desc,r,false);
  if(detailed&&desc.material!=='rocky'){
    const halo=ctx.createRadialGradient(0,0,r*.95,0,0,r*1.13);halo.addColorStop(0,COLOR.atmosphere);halo.addColorStop(1,COLOR.transparent);
    ctx.fillStyle=halo;ctx.beginPath();ctx.arc(0,0,r*1.13,0,TAU);ctx.fill();
  }
  const size=screenRadius<18||quality==='low'?48:quality==='high'&&screenRadius>=32?160:96;
  const surface=material(desc,size);
  if(surface)ctx.drawImage(surface.canvas,-r,-r,r*2,r*2);
  else {const fill=ctx.createRadialGradient(-r*.34,-r*.44,r*.06,0,0,r*1.02);
    fill.addColorStop(0,COLOR.lit);fill.addColorStop(.45,desc.color);fill.addColorStop(1,COLOR.dark);
    ctx.fillStyle=fill;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();}
  if(detailed&&desc.material!=='rocky'){
    const weather=endlessPlanetWeather(desc,time);
    ctx.save();ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.clip();
    ctx.globalAlpha=weather.activity*weather.visibility*endlessPlanetLight(weather.x,weather.y);
    ctx.fillStyle=desc.material==='ice'?COLOR.iceCloud:COLOR.storm;ctx.beginPath();
    ctx.ellipse(weather.x*r,weather.y*r,r*(desc.material==='ice'?.32:.2),r*.065,-.12,0,TAU);ctx.fill();
    if(desc.material==='gas'){
      ctx.strokeStyle=COLOR.stormShade;ctx.lineWidth=r*.018;ctx.beginPath();
      ctx.ellipse(weather.x*r,weather.y*r,r*.14,r*.037,-.12,0,TAU);ctx.stroke();
      ctx.strokeStyle=COLOR.ringLight;ctx.lineWidth=r*.015;ctx.globalAlpha=.045;
      for(let i=0;i<3;i++){const y=r*(-.52+i*.47),shift=Math.sin(time*.08+i+desc.seed)*r*.045;
        ctx.beginPath();ctx.moveTo(-r,y);ctx.bezierCurveTo(-r*.4,y+shift,r*.4,y-shift,r,y);ctx.stroke();}
    }
    ctx.restore();
  }
  if(rings){
    ringHalf(ctx,desc,r,true);
    ctx.fillStyle=COLOR.ringLight;ctx.globalAlpha=.7;ctx.textAlign='center';
    ctx.font=`${10/camera.zoom}px system-ui`;ctx.fillText(desc.ringLabel,0,r+15/camera.zoom);
  }
  ctx.restore();
}
