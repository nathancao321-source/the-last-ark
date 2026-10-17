import type { Camera } from '../../camera/camera';
import { seededRandom } from '../../world/sectors';
import type { WarpConfig } from './config';
import type { ArtConfig } from './art';
import { TILE,RES } from './texture';
import { sampleDisturbance } from './model';
import type { VisualState,Sample } from './model';

export interface BackgroundCache {texture:HTMLCanvasElement;view:HTMLCanvasElement;key:string;viewKey:string;stars:Float32Array;generationMs:number}
function canvas(w:number,h=w):HTMLCanvasElement {const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
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
    cache.viewKey='';cache.generationMs=result.ms;
  });return cache;
}
function prepareView(b:BackgroundCache,c:Camera):void {
  const factor=Math.min(1,1600/c.width,1000/c.height),w=Math.max(1,Math.round(c.width*factor)),h=Math.max(1,Math.round(c.height*factor));
  const ox=c.position.x*.16,oy=c.position.y*.16,key=[w,h,ox,oy].join(',');if(key===b.viewKey)return;b.viewKey=key;
  if(b.view.width!==w||b.view.height!==h){b.view.width=w;b.view.height=h;}
  const ctx=b.view.getContext('2d')!;ctx.setTransform(w/c.width,0,0,h/c.height,0,0);
  // Texels and stars have the same far-plane parallax. Nodes remain world anchored.
  for(let y=Math.floor(oy/TILE);y<=Math.floor((oy+c.height)/TILE);y++)for(let x=Math.floor(ox/TILE);x<=Math.floor((ox+c.width)/TILE);x++)ctx.drawImage(b.texture,x*TILE-ox,y*TILE-oy,TILE,TILE);
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
export function drawBackground(ctx:CanvasRenderingContext2D,b:BackgroundCache,c:Camera,state:VisualState,warp:WarpConfig,a:ArtConfig,sample:Sample):{samples:number;vertices:number} {
  prepareView(b,c);let samples=0,vertices=0;
  const high=warp.quality==='high',advanced=warp.quality!=='low',nx=high?8:6,ny=high?5:4,grid:Vertex[]=[];
  const active=advanced&&state.sources.some(s=>s.weight>1e-5);
  if(active&&(warp.starWarp||warp.luminance)) {
    for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++) {
      const sx=c.width*x/nx,sy=c.height*y/ny;
      const s=sampleDisturbance(sample,(sx-c.width/2)/c.zoom+c.position.x,(sy-c.height/2)/c.zoom+c.position.y,state,warp,c.zoom,224);samples++;
      grid.push({x:sx+(warp.starWarp?s.dx:0),y:sy+(warp.starWarp?s.dy:0),u:b.view.width*x/nx,v:b.view.height*y/ny,b:warp.luminance?s.luminance:0});
    }
    for(let y=0;y<ny;y++)for(let x=0;x<nx;x++) {const i=y*(nx+1)+x,p=grid[i],q=grid[i+1],r=grid[i+nx+1],s=grid[i+nx+2];triangle(ctx,b.view,p,q,r);triangle(ctx,b.view,q,s,r);}
    // Smooth cached nebula already carries dust contrast. Modulate only a subtle
    // low-frequency signed illumination sampled from the identical distortion.
    for(let y=0;y<ny;y++)for(let x=0;x<nx;x++) {const i=y*(nx+1)+x,p=grid[i],q=grid[i+1],r=grid[i+nx+1],s=grid[i+nx+2],v=(p.b+q.b+r.b+s.b)/4;
      if(Math.abs(v)<.001)continue;ctx.globalAlpha=Math.abs(v)*.65;ctx.fillStyle=v<0?'#00000a':'#b7a8cc';ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.lineTo(s.x,s.y);ctx.lineTo(r.x,r.y);ctx.closePath();ctx.fill();}
    ctx.globalAlpha=1;
  } else ctx.drawImage(b.view,0,0,c.width,c.height);
  const density=a.stars*(a.background==='dense'?1:.21),ox=c.position.x*.16,oy=c.position.y*.16;
  for(let bucket=0;bucket<5;bucket++) {
    ctx.fillStyle=['#9996ad','#b5b3c2','#ddd5ce','#c3d7fa','#f4ede2'][bucket];ctx.globalAlpha=[.4,.6,.8,.9,1][bucket]*Math.min(1,a.exposure);ctx.beginPath();
    for(let ty=Math.floor((oy-42)/TILE);ty<=Math.floor((oy+c.height+42)/TILE);ty++)for(let tx=Math.floor((ox-42)/TILE);tx<=Math.floor((ox+c.width+42)/TILE);tx++)for(let i=0;i<b.stars.length;i+=5) {
      const light=b.stars[i+2],group=light<.55?0:light<.82?1:light<.95?2:light<.99?3:4;
      if(group!==bucket||b.stars[i+4]>density)continue;
      let x=b.stars[i]+tx*TILE-ox,y=b.stars[i+1]+ty*TILE-oy;if(x< -42||y< -42||x>c.width+42||y>c.height+42)continue;
      if(active&&warp.starWarp){const s=sampleDisturbance(sample,(x-c.width/2)/c.zoom+c.position.x,(y-c.height/2)/c.zoom+c.position.y,state,warp,c.zoom,224);x+=s.dx;y+=s.dy;samples++;}
      const size=bucket===4?1.8:.65+bucket*.23+b.stars[i+3]*.4;ctx.rect(x,y,size,size);if(bucket===4){ctx.rect(x-2,y+.5,6,.5);ctx.rect(x+.5,y-2,.5,6);}vertices++;
    }ctx.fill();
  }ctx.globalAlpha=1;return {samples,vertices};
}
