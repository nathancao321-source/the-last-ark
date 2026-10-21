import type {Camera} from '../../camera/camera';
import {viewBounds,worldToScreen} from '../../camera/camera';
import type {ArtConfig} from './art';
import type {WarpConfig} from './config';
import {sampleDisturbance} from './model';
import type {VisualState} from './model';
import {hash} from './noise';
import {ABYSS_TILE,ABYSS_RES,ABYSS_GUTTER,ABYSS_CAPACITY} from './abyss-material';
import type {AbyssTileRequest} from './abyss-material';

interface Tile {canvas:HTMLCanvasElement;used:number}
export interface AbyssBackground {tiles:Map<string,Tile>;pending:AbyssTileRequest[];worker?:Worker;busy?:string;tick:number;generationMs:number;error?:string}
export function createAbyssBackground():AbyssBackground{return {tiles:new Map(),pending:[],tick:0,generationMs:0};}
function dispatch(cache:AbyssBackground):void {
 if(cache.busy||!cache.pending.length||cache.error)return;
 if(!cache.worker){
  cache.worker=new Worker(new URL('./abyss-worker.ts',import.meta.url),{type:'module'});
  cache.worker.onmessage=({data}:{data:{key:string;pixels:Uint8ClampedArray;ms:number}})=>{
   const canvas=document.createElement('canvas');canvas.width=canvas.height=ABYSS_RES+ABYSS_GUTTER*2;
   const ctx=canvas.getContext('2d')!,image=ctx.createImageData(canvas.width,canvas.height);image.data.set(data.pixels);ctx.putImageData(image,0,0);
   cache.tiles.set(data.key,{canvas,used:cache.tick});cache.generationMs=data.ms;cache.busy=undefined;
   while(cache.tiles.size>ABYSS_CAPACITY){let oldest='';let age=Infinity;for(const [key,tile]of cache.tiles)if(tile.used<age){age=tile.used;oldest=key;}cache.tiles.delete(oldest);}
   dispatch(cache);
  };
  cache.worker.onerror=()=>{cache.error='星云区块生成失败';cache.worker?.terminate();cache.worker=undefined;cache.busy=undefined;cache.pending=[];};
 }
 const request=cache.pending.shift()!;cache.busy=request.key;cache.worker.postMessage(request);
}
export function disposeAbyssBackground(cache:AbyssBackground):void {cache.worker?.terminate();cache.worker=undefined;cache.busy=undefined;cache.pending=[];}

/** One world image, projected once. Fields displace a complete shared lattice;
 * no opaque local rectangles are painted over an already drawn backdrop. */
export function drawAbyssBackground(ctx:CanvasRenderingContext2D,cache:AbyssBackground,c:Camera,state:VisualState,warp:WarpConfig,a:ArtConfig):void {
 cache.tick++;ctx.save();ctx.fillStyle='#03050b';ctx.fillRect(0,0,c.width,c.height);
 const bounds=viewBounds(c),span=ABYSS_TILE*2**Math.max(0,Math.ceil(Math.log2(.32/c.zoom)));
 const requests:AbyssTileRequest[]=[];
 for(let ty=Math.floor(bounds.minY/span);ty<=Math.floor(bounds.maxY/span);ty++)for(let tx=Math.floor(bounds.minX/span);tx<=Math.floor(bounds.maxX/span);tx++){
  const key=[tx,ty,span,a.nebula,a.exposure].join(':');requests.push({key,x:tx*span,y:ty*span,span,art:a});
 }
 // Only current visible work may be queued; zooming cannot create an unbounded backlog.
 cache.pending=requests.filter(r=>!cache.tiles.has(r.key)&&r.key!==cache.busy).sort((a,b)=>Math.hypot(a.x+span/2-c.position.x,a.y+span/2-c.position.y)-Math.hypot(b.x+span/2-c.position.x,b.y+span/2-c.position.y));
 dispatch(cache);
 const active=warp.quality!=='low'&&warp.starWarp&&state.sources.some(s=>s.weight>1e-5);
 for(const request of requests){
  const tile=cache.tiles.get(request.key);if(!tile)continue;tile.used=cache.tick;
  const origin=worldToScreen(c,request),size=span*c.zoom;
  if(!active){ctx.drawImage(tile.canvas,ABYSS_GUTTER,ABYSS_GUTTER,ABYSS_RES,ABYSS_RES,origin.x,origin.y,size+.2,size+.2);continue;}
  const n=warp.quality==='high'?12:8;
  const point=(ix:number,iy:number)=>{
   const wx=request.x+ix/n*span,wy=request.y+iy/n*span,p=worldToScreen(c,{x:wx,y:wy});
   const d=sampleDisturbance({dx:0,dy:0,luminance:0},wx,wy,state,warp,c.zoom,224);
   return {x:p.x+d.dx,y:p.y+d.dy,u:ABYSS_GUTTER+ix/n*ABYSS_RES,v:ABYSS_GUTTER+iy/n*ABYSS_RES};
  };
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const p=point(x,y),q=point(x+1,y),r=point(x,y+1),s=point(x+1,y+1);drawTriangle(ctx,tile.canvas,p,q,r);drawTriangle(ctx,tile.canvas,q,s,r);}
 }
 drawAbyssStars(ctx,c,state,warp,a);ctx.restore();
}
interface Vertex{x:number;y:number;u:number;v:number}
function drawTriangle(ctx:CanvasRenderingContext2D,image:HTMLCanvasElement,a:Vertex,b:Vertex,c:Vertex):void {
 const det=(b.u-a.u)*(c.v-a.v)-(c.u-a.u)*(b.v-a.v);if(Math.abs(det)<1e-8)return;
 const m0=((b.x-a.x)*(c.v-a.v)-(c.x-a.x)*(b.v-a.v))/det,m1=((b.y-a.y)*(c.v-a.v)-(c.y-a.y)*(b.v-a.v))/det,m2=((c.x-a.x)*(b.u-a.u)-(b.x-a.x)*(c.u-a.u))/det,m3=((c.y-a.y)*(b.u-a.u)-(b.y-a.y)*(c.u-a.u))/det;
 ctx.save();ctx.beginPath();const cx=(a.x+b.x+c.x)/3,cy=(a.y+b.y+c.y)/3;
 for(const [i,p]of [a,b,c].entries()){const dx=p.x-cx,dy=p.y-cy,k=.45/Math.max(1,Math.hypot(dx,dy));if(i===0)ctx.moveTo(p.x+dx*k,p.y+dy*k);else ctx.lineTo(p.x+dx*k,p.y+dy*k);}
 ctx.closePath();ctx.clip();ctx.transform(m0,m1,m2,m3,a.x-m0*a.u-m2*a.v,a.y-m1*a.u-m3*a.v);ctx.drawImage(image,0,0);ctx.restore();
}
function drawAbyssStars(ctx:CanvasRenderingContext2D,c:Camera,state:VisualState,warp:WarpConfig,a:ArtConfig):void {
 const bounds=viewBounds(c),cell=384,stride=2**Math.max(0,Math.ceil(Math.log2(.18/c.zoom))),spacing=cell*stride;
 for(let ty=Math.floor(bounds.minY/spacing)-1;ty<=Math.floor(bounds.maxY/spacing)+1;ty++)for(let tx=Math.floor(bounds.minX/spacing)-1;tx<=Math.floor(bounds.maxX/spacing)+1;tx++)for(let i=0;i<36;i++){
  if(hash(tx*stride,ty*stride,i+99)>a.stars)continue;
  const world={x:(tx*stride+hash(tx*stride,ty*stride,i*3+500))*cell,y:(ty*stride+hash(tx*stride,ty*stride,i*3+501))*cell};
  const p=worldToScreen(c,world),light=hash(tx*stride,ty*stride,i*3+502);
  if(warp.quality!=='low'&&warp.starWarp){const s=sampleDisturbance({dx:0,dy:0,luminance:0},world.x,world.y,state,warp,c.zoom,224);p.x+=s.dx;p.y+=s.dy;}
  const r=Math.max(.35,(light>.98?1.65:.45+light*.65)*c.zoom);ctx.globalAlpha=(.22+light*.65)*Math.min(1,a.exposure);ctx.fillStyle=light>.94?'#e7e3d9':'#b9bbcf';ctx.fillRect(p.x-r/2,p.y-r/2,r,r);
 }
 ctx.globalAlpha=1;
}
