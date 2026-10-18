import type { Camera } from '../../camera/camera';
import { worldToScreen,viewBounds } from '../../camera/camera';
import { seededRandom } from '../../world/sectors';
import type { WarpConfig } from './config';
import type { ArtConfig } from './art';
import { TILE,RES } from './texture';
import { sampleDisturbance } from './model';
import type { VisualState,Sample } from './model';

export interface BackgroundCache {texture:HTMLCanvasElement;view:HTMLCanvasElement;pattern?:CanvasPattern;shades?:[HTMLCanvasElement,HTMLCanvasElement];key:string;viewKey:string;stars:Float32Array;generationMs:number}
function canvas(w:number,h=w):HTMLCanvasElement {const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function shade(color:string):HTMLCanvasElement {
  const c=canvas(64),ctx=c.getContext('2d')!,image=ctx.createImageData(64,64);
  const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){
    const ux=Math.abs((x+.5-32)/32),uy=Math.abs((y+.5-32)/32),h=(v:number)=>1-v*v*(3-2*v),i=(y*64+x)*4;
    image.data[i]=rgb[0];image.data[i+1]=rgb[1];image.data[i+2]=rgb[2];image.data[i+3]=Math.round(255*h(ux)*h(uy));
  }ctx.putImageData(image,0,0);return c;
}
interface TextureResult {pixels:Uint8ClampedArray;stars:Float32Array;ms:number}
let worker:Worker|undefined,busy=false,queued:(()=>void)|undefined,done:((result:TextureResult)=>void)|undefined;
function requestTexture(a:ArtConfig,receive:(result:TextureResult)=>void):void {
  // One active job + only the latest pending request. Slider changes cannot
  // accumulate an unbounded worker queue. Expensive noise never blocks input.
  const submit=()=>{
    if(!worker){worker=new Worker(new URL('./texture-worker.ts',import.meta.url),{type:'module'});
      worker.onmessage=(event:MessageEvent<TextureResult>)=>{done?.(event.data);done=undefined;busy=false;const next=queued;queued=undefined;next?.();};
      worker.onerror=()=>{done=undefined;busy=false;worker?.terminate();worker=undefined;const next=queued;queued=undefined;next?.();};}
    busy=true;done=receive;worker.postMessage(a);
  };if(busy)queued=submit;else submit();
}
export function backgroundKey(a:ArtConfig):string{return [a.background,a.nebula,a.exposure].join(':');}
export function createBackground(a:ArtConfig,stars:Float32Array=new Float32Array()):BackgroundCache {
  const texture=canvas(RES),ctx=texture.getContext('2d')!;
  ctx.fillStyle='#020307';ctx.fillRect(0,0,RES,RES);
  const cache:BackgroundCache={texture,view:canvas(1),key:backgroundKey(a),viewKey:'',stars,generationMs:-1};
  requestTexture({...a},result=>{
    const data=ctx.createImageData(RES,RES);data.data.set(result.pixels);ctx.putImageData(data,0,0);cache.stars=result.stars;
  // A handful of distant galaxies, cached once, with warped spiral dust lanes.
  const random=seededRandom(6102);ctx.save();
  for(let g=0;g<7;g++) {
    const x=100+random()*824,y=100+random()*824,r=2+random()*5;
    ctx.save();ctx.translate(x,y);ctx.rotate(random()*Math.PI);ctx.scale(1,.42);
    const glow=ctx.createRadialGradient(0,0,0,0,0,r*4);glow.addColorStop(0,'#c3b7a86a');glow.addColorStop(.17,'#98a0bb25');glow.addColorStop(1,'#606e9800');ctx.fillStyle=glow;ctx.fillRect(-r*4,-r*4,r*8,r*8);
    ctx.strokeStyle='#9ba2c332';ctx.lineWidth=.35;
    for(let arm=0;arm<2;arm++){ctx.beginPath();for(let j=0;j<50;j++){const t=j/50*5,radius=r*j/50,angle=t+arm*Math.PI;const px=Math.cos(angle)*radius,py=Math.sin(angle)*radius;if(j===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);}ctx.stroke();}ctx.restore();
  }ctx.restore();
    cache.viewKey='';cache.pattern=undefined;cache.generationMs=result.ms;
  });return cache;
}
function prepareView(b:BackgroundCache,c:Camera):void {
  const factor=Math.min(1,1600/c.width,1000/c.height),w=Math.max(1,Math.round(c.width*factor)),h=Math.max(1,Math.round(c.height*factor));
  const key=[w,h,c.position.x,c.position.y,c.zoom].join(',');if(key===b.viewKey)return;b.viewKey=key;
  if(b.view.width!==w||b.view.height!==h){b.view.width=w;b.view.height=h;}
  const ctx=b.view.getContext('2d')!;
  // Texture texel (u,v) has the same stable world origin as its stars. No
  // parallax or accumulated camera deltas; zoom and translation applied once.
  const bounds=viewBounds(c),origin=worldToScreen(c,{x:0,y:0}),unit=TILE/RES;
  b.pattern??=ctx.createPattern(b.texture,'repeat')!;ctx.fillStyle=b.pattern;
  ctx.setTransform(w/c.width*c.zoom*unit,0,0,h/c.height*c.zoom*unit,origin.x*w/c.width,origin.y*h/c.height);
  ctx.fillRect(bounds.minX/unit,bounds.minY/unit,(bounds.maxX-bounds.minX)/unit,(bounds.maxY-bounds.minY)/unit);
}
export interface WorldCell {x:number;y:number;spacing:number;priority:number}
/** Only visible WORLD-lattice cells intersecting the annulus; bounded separately
 * from node mesh budgets. Camera culling never shifts the sampling lattice. */
export function waveCells(state:VisualState,warp:WarpConfig,camera:Camera):WorldCell[] {
 const wave=state.hazardWave;if(!wave||warp.quality==='off'||warp.quality==='low')return [];
 const bounds=viewBounds(camera),base=warp.quality==='high'?192:256;
 const spacing=base*2**Math.max(0,Math.ceil(Math.log2((bounds.maxX-bounds.minX)/base/14)));
 const cells:WorldCell[]=[],middle=wave.front-wave.thickness*.5;
 for(let iy=Math.floor(bounds.minY/spacing);iy<=Math.floor(bounds.maxY/spacing);iy++)for(let ix=Math.floor(bounds.minX/spacing);ix<=Math.floor(bounds.maxX/spacing);ix++){
  const x=ix*spacing,y=iy*spacing,near=Math.hypot(Math.max(x-wave.origin.x,0,wave.origin.x-x-spacing),Math.max(y-wave.origin.y,0,wave.origin.y-y-spacing));
  const far=Math.max(...[x,x+spacing].flatMap(xx=>[y,y+spacing].map(yy=>Math.hypot(xx-wave.origin.x,yy-wave.origin.y))));
  if(near<=wave.front+spacing&&far>=Math.max(0,middle-wave.thickness-spacing))cells.push({x,y,spacing,priority:1});
 }return cells.slice(0,96);
}
/** Fixed WORLD lattice, selected without a camera. Thus camera motion cannot
 * reshuffle illumination samples or move their interpolation cells. Only real
 * source/event changes affect this bounded, faint-edge visual LOD selection. */
export function worldCells(state:VisualState,warp:WarpConfig):WorldCell[] {
  const spacing=warp.quality==='high'?256:320,capacity=warp.quality==='high'?48:32,cells=new Map<string,WorldCell>();
  const regions=state.sources.filter(s=>s.weight>1e-5).map(s=>({x:s.position.x,y:s.position.y,r:s.field.radius,w:s.weight}));
  if(warp.interaction)for(const e of state.events)if(e.alive)regions.push({x:e.origin.x,y:e.origin.y,r:e.radius,w:Math.exp(-e.age/e.decay)*e.amplitude});
  for(const p of state.portals??[])regions.push({x:p.origin.x,y:p.origin.y,r:p.radius*2.5,w:.6});
  for(const p of regions)for(let iy=Math.floor((p.y-p.r)/spacing);iy<=Math.floor((p.y+p.r)/spacing);iy++)for(let ix=Math.floor((p.x-p.r)/spacing);ix<=Math.floor((p.x+p.r)/spacing);ix++){
    const x=ix*spacing,y=iy*spacing,dx=Math.max(x-p.x,0,p.x-x-spacing),dy=Math.max(y-p.y,0,p.y-y-spacing),d=Math.hypot(dx,dy);
    if(d>=p.r)continue;const priority=p.w*(1-d/p.r)**2,key=ix+','+iy,old=cells.get(key);
    if(old)old.priority+=priority;else cells.set(key,{x,y,spacing,priority});
  }
  return [...cells.values()].sort((a,b)=>b.priority-a.priority||a.y-b.y||a.x-b.x).slice(0,capacity);
}
interface Vertex {x:number;y:number;u:number;v:number;b:number}
function triangle(ctx:CanvasRenderingContext2D,image:HTMLCanvasElement,a:Vertex,b:Vertex,c:Vertex):void {
  const det=(b.u-a.u)*(c.v-a.v)-(c.u-a.u)*(b.v-a.v),m0=((b.x-a.x)*(c.v-a.v)-(c.x-a.x)*(b.v-a.v))/det,m1=((b.y-a.y)*(c.v-a.v)-(c.y-a.y)*(b.v-a.v))/det,
    m2=((c.x-a.x)*(b.u-a.u)-(b.x-a.x)*(c.u-a.u))/det,m3=((c.y-a.y)*(b.u-a.u)-(b.y-a.y)*(c.u-a.u))/det;
  ctx.save();ctx.beginPath();
  // Sub-pixel overlap covers antialiased clip seams, without changing sample locations.
  const cx=(a.x+b.x+c.x)/3,cy=(a.y+b.y+c.y)/3;
  for(const [i,p] of [a,b,c].entries()){const dx=p.x-cx,dy=p.y-cy,k=.65/Math.max(1,Math.hypot(dx,dy));if(i===0)ctx.moveTo(p.x+dx*k,p.y+dy*k);else ctx.lineTo(p.x+dx*k,p.y+dy*k);}
  ctx.closePath();ctx.clip();ctx.transform(m0,m1,m2,m3,a.x-m0*a.u-m2*a.v,a.y-m1*a.u-m3*a.v);ctx.drawImage(image,0,0);ctx.restore();
}
/** Shared D/B model deforms the actual cached nebula sheet, not an overlaid disc. */
export function drawBackground(ctx:CanvasRenderingContext2D,b:BackgroundCache,c:Camera,state:VisualState,warp:WarpConfig,a:ArtConfig,sample:Sample):{samples:number;vertices:number;cells:number} {
  prepareView(b,c);let samples=0,vertices=0,cells=0;
  const advanced=warp.quality!=='low',active=advanced&&(state.sources.some(s=>s.weight>1e-5)||!!state.portals?.length||!!state.hazardWave||(warp.interaction&&state.events.some(e=>e.alive)));
  ctx.drawImage(b.view,0,0,c.width,c.height);
  if(active&&(warp.starWarp||warp.luminance)) {
    const vertex=(wx:number,wy:number):Vertex=>{
      const p=worldToScreen(c,{x:wx,y:wy}),s=sampleDisturbance(sample,wx,wy,state,warp,c.zoom,224);samples++;
      return {x:p.x+s.dx,y:p.y+s.dy,u:p.x/c.width*b.view.width,v:p.y/c.height*b.view.height,b:s.luminance};
    };
    const illumination:{x:number;y:number;size:number;value:number}[]=[];
    for(const cell of [...worldCells(state,warp),...waveCells(state,warp,c)]) {
      const origin=worldToScreen(c,cell),size=cell.spacing*c.zoom;
      if(origin.x+size< -42||origin.y+size< -42||origin.x>c.width+42||origin.y>c.height+42)continue;
      cells++;
      const p=vertex(cell.x,cell.y),q=vertex(cell.x+cell.spacing,cell.y),r=vertex(cell.x,cell.y+cell.spacing),s=vertex(cell.x+cell.spacing,cell.y+cell.spacing);
      triangle(ctx,b.view,p,q,r);triangle(ctx,b.view,q,s,r);
      const v=(p.b+q.b+r.b+s.b)/4;
      if(Math.abs(v)>.001)illumination.push({x:origin.x,y:origin.y,size,value:v});
    }
    // Complete ALL opaque mesh triangles before applying feathered light.
    // Otherwise the next cell erases its neighbor's feather at a hard boundary.
    if(illumination.length){
      b.shades??=[shade('#000000'),shade('#ffffff')];ctx.globalCompositeOperation='soft-light';
      for(const light of illumination){ctx.globalAlpha=Math.abs(light.value)*.9;
        ctx.drawImage(b.shades[light.value<0?0:1],light.x-light.size*.5,light.y-light.size*.5,light.size*2,light.size*2);
      }
      ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    }
  }

  const density=a.stars*(a.background==='dense'?1:.21),bounds=viewBounds(c),padding=42/c.zoom;
  // At extreme zoom-out thin fixed world sites, never rescale their positions.
  // At ordinary demo zoom this is 1. Bounds stay finite even at tiny camera zoom.
  const stride=2**Math.max(0,Math.ceil(Math.log2(Math.max(c.width,c.height)/c.zoom/TILE/4)));
  for(let bucket=0;bucket<5;bucket++) {
    ctx.fillStyle=['#9996ad','#b5b3c2','#ddd5ce','#c3d7fa','#f4ede2'][bucket];ctx.globalAlpha=[.4,.6,.8,.9,1][bucket]*Math.min(1,a.exposure);ctx.beginPath();
    for(let ty=Math.floor((bounds.minY-padding)/TILE/stride)*stride;ty<=Math.floor((bounds.maxY+padding)/TILE);ty+=stride)for(let tx=Math.floor((bounds.minX-padding)/TILE/stride)*stride;tx<=Math.floor((bounds.maxX+padding)/TILE);tx+=stride)for(let i=0;i<b.stars.length;i+=5) {
      const light=b.stars[i+2],group=light<.55?0:light<.82?1:light<.95?2:light<.99?3:4;
      if(group!==bucket||b.stars[i+4]>density)continue;
      const wx=b.stars[i]+tx*TILE,wy=b.stars[i+1]+ty*TILE,p=worldToScreen(c,{x:wx,y:wy});let x=p.x,y=p.y;if(x< -42||y< -42||x>c.width+42||y>c.height+42)continue;
      if(active&&warp.starWarp){const s=sampleDisturbance(sample,wx,wy,state,warp,c.zoom,224);x+=s.dx;y+=s.dy;samples++;}
      const size=Math.max(.3,(bucket===4?1.8:.65+bucket*.23+b.stars[i+3]*.4)*c.zoom);ctx.rect(x,y,size,size);if(bucket===4){ctx.rect(x-2*c.zoom,y+.5*c.zoom,6*c.zoom,.5*c.zoom);ctx.rect(x+.5*c.zoom,y-2*c.zoom,.5*c.zoom,6*c.zoom);}vertices++;
    }ctx.fill();
  }ctx.globalAlpha=1;return {samples,vertices,cells};
}
