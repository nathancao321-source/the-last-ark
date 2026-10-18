import type {Camera} from '../camera/camera';
import {viewBounds,worldToScreen} from '../camera/camera';
import type {GameState} from '../game/types';
import type {VisualState,Sample} from './spacetime/model';
import {sampleDisturbance} from './spacetime/model';
import type {WarpConfig} from './spacetime/config';
import type {ArtConfig} from './spacetime/art';
import {drawBackground,type BackgroundCache} from './spacetime/background';
import {generateEndlessStars} from './endless-field';
import {SECTOR_SIZE} from '../world/sectors';
export const ENDLESS_TILE_LIMIT=32;
interface Tile {key:string;tx:number;ty:number;span:number;res:number;texture?:HTMLCanvasElement;activity?:HTMLCanvasElement;stars:ReturnType<typeof generateEndlessStars>;used:number}
export interface EndlessBackground {tiles:Map<string,Tile>;worker?:Worker;pending:string[];busy?:string;seed:number;clock:number;sheet?:BackgroundCache;stats:{generated:number;generationMs:number;drawn:number;stars:number;bytes:number;pending:number;entries:number}}
export function createEndlessBackground():EndlessBackground{return {tiles:new Map(),pending:[],seed:0,clock:0,stats:{generated:0,generationMs:0,drawn:0,stars:0,bytes:0,pending:0,entries:0}};}
export function resetEndlessBackground(cache:EndlessBackground):void{cache.worker?.terminate();delete cache.worker;delete cache.busy;delete cache.sheet;Object.assign(cache,createEndlessBackground());}
/** OFF cancels unfinished work; warm textures remain reusable without allocation. */
export function suspendEndlessBackground(cache:EndlessBackground):void{if(!cache.busy&&!cache.pending.length)return;cache.worker?.terminate();delete cache.worker;delete cache.busy;cache.pending=[];cache.stats.pending=0;}
const surface=(w:number,h=w)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
const COLORS=['#78849dff','#9cadc9ff','#c6d9edff','#f1dfc5ff'];
function pump(cache:EndlessBackground):void{
 if(cache.busy)return;
 const key=cache.pending.shift();if(!key)return;const tile=cache.tiles.get(key);if(!tile){pump(cache);return;}
 if(!cache.worker){cache.worker=new Worker(new URL('./endless-background-worker.ts',import.meta.url),{type:'module'});
  cache.worker.onmessage=(e:MessageEvent<{key:string;pixels:Uint8ClampedArray;activity:Uint8ClampedArray;ms:number}>)=>{
   const t=cache.tiles.get(e.data.key);if(t){const size=t.res+2;
    const make=(pixels:Uint8ClampedArray)=>{const c=surface(size),ctx=c.getContext('2d')!,image=ctx.createImageData(size,size);image.data.set(pixels);ctx.putImageData(image,0,0);return c;};
    t.texture=make(e.data.pixels);t.activity=make(e.data.activity);cache.stats.generated++;cache.stats.generationMs+=e.data.ms;
   }cache.busy=undefined;pump(cache);
  };
  cache.worker.onerror=()=>{cache.worker?.terminate();cache.worker=undefined;cache.busy=undefined;cache.pending=[];};
 }
 cache.busy=key;cache.worker.postMessage({seed:cache.seed,key,tx:tile.tx,ty:tile.ty,span:tile.span,res:tile.res});
}
/** Fixed absolute lattice. Projection subtracts the universe origin once. */
export function endlessTilePlan(camera:Camera,origin:{x:number;y:number}){
 const b=viewBounds(camera),span=2048*2**Math.max(0,Math.ceil(Math.log2(Math.max(b.maxX-b.minX,b.maxY-b.minY)/6144)));
 const keys:{tx:number;ty:number;span:number}[]=[];
 for(let ty=Math.floor((b.minY+origin.y)/span);ty<=Math.floor((b.maxY+origin.y)/span);ty++)for(let tx=Math.floor((b.minX+origin.x)/span);tx<=Math.floor((b.maxX+origin.x)/span);tx++)keys.push({tx,ty,span});
 return keys;
}
export function drawEndlessBackground(ctx:CanvasRenderingContext2D,cache:EndlessBackground,game:GameState,camera:Camera,state:VisualState,warp:WarpConfig,art:ArtConfig,sample:Sample):void{
 if(warp.quality==='off'){suspendEndlessBackground(cache);return;}if(!game.universe)return;
 const seed=game.universe.seed;if(cache.seed!==seed){resetEndlessBackground(cache);cache.seed=seed;}
 const origin={x:game.universe.origin.x*SECTOR_SIZE,y:game.universe.origin.y*SECTOR_SIZE};
 const plan=endlessTilePlan(camera,origin),res=warp.quality==='high'?192:warp.quality==='medium'?128:80;
 cache.clock++;const active:Tile[]=[],needed=new Set<string>(),visible=new Set(plan.map(p=>p.tx+','+p.ty));
 const ahead=new Map(plan.map(p=>[p.tx+','+p.ty,p]));
 for(const p of plan)for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++){const q={tx:p.tx+x,ty:p.ty+y,span:p.span};ahead.set(q.tx+','+q.ty,q);}
 // Visible tiles first, then a bounded ring prepared before normal-speed travel.
 const requests=[...ahead.values()].sort((a,b)=>Number(visible.has(b.tx+','+b.ty))-Number(visible.has(a.tx+','+a.ty))).slice(0,28);
 for(const p of requests){const key=[seed,p.span,p.tx,p.ty,res].join(':');needed.add(key);let t=cache.tiles.get(key);
  if(!t){t={...p,res,key,stars:generateEndlessStars(seed,p.tx,p.ty,p.span),used:cache.clock};cache.tiles.set(key,t);}t.used=cache.clock;
  if(visible.has(p.tx+','+p.ty))active.push(t);
 }
 cache.pending=[...needed].filter(k=>!cache.tiles.get(k)?.texture&&k!==cache.busy);
 const bounds=viewBounds(camera),overlap=(t:Tile)=>!!t.texture&&t.tx*t.span-origin.x<bounds.maxX&&(t.tx+1)*t.span-origin.x>bounds.minX&&t.ty*t.span-origin.y<bounds.maxY&&(t.ty+1)*t.span-origin.y>bounds.minY;
 for(const t of [...cache.tiles.values()].sort((a,b)=>Number(overlap(a))-Number(overlap(b))||a.used-b.used))if(cache.tiles.size>ENDLESS_TILE_LIMIT&&!needed.has(t.key))cache.tiles.delete(t.key);
 pump(cache);
 const factor=Math.min(1,1600/camera.width,1000/camera.height),w=Math.round(camera.width*factor),h=Math.round(camera.height*factor);
 if(!cache.sheet){const view=surface(w,h);cache.sheet={texture:view,view,key:'endless',viewKey:'',stars:new Float32Array(),generationMs:0};}
 const view=cache.sheet.view;if(view.width!==w||view.height!==h){view.width=w;view.height=h;}const v=view.getContext('2d')!;
 v.setTransform(factor,0,0,factor,0,0);v.globalAlpha=1;v.fillStyle='#02040aff';v.fillRect(0,0,camera.width,camera.height);
 cache.stats.drawn=0;cache.stats.stars=0;
 // Keep the previous world-anchored LOD underneath while new tiles load.
 const fallback=[...cache.tiles.values()].filter(t=>t.texture&&!needed.has(t.key));
 for(const t of [...fallback,...active])if(t.texture){const x=(t.tx*t.span-origin.x-camera.position.x)*camera.zoom+camera.width/2,y=(t.ty*t.span-origin.y-camera.position.y)*camera.zoom+camera.height/2,s=t.span*camera.zoom;
  if(x+s<0||y+s<0||x>camera.width||y>camera.height)continue;
  v.drawImage(t.texture,1,1,t.res,t.res,x,y,s,s);
  if(t.activity&&warp.quality!=='low'){v.globalCompositeOperation='screen';v.globalAlpha=.2+.12*Math.sin(state.time*.085);v.drawImage(t.activity,1,1,t.res,t.res,x,y,s,s);v.globalAlpha=1;v.globalCompositeOperation='source-over';}cache.stats.drawn++;
 }
 ctx.save();drawBackground(ctx,cache.sheet,camera,state,warp,{...art,stars:0},sample,true,true);
 const advanced=warp.quality!=='low';
 for(let bucket=0;bucket<COLORS.length;bucket++){ctx.fillStyle=COLORS[bucket];ctx.globalAlpha=[.62,.7,.84,.96][bucket];ctx.beginPath();
  for(const tile of active)for(const s of tile.stars){if(Math.min(3,Math.floor(s.brightness*4))!==bucket)continue;
   const p={x:s.x-origin.x,y:s.y-origin.y},screen=worldToScreen(camera,p);if(screen.x< -12||screen.y< -12||screen.x>camera.width+12||screen.y>camera.height+12)continue;
   if(advanced&&warp.starWarp){sampleDisturbance(sample,p.x,p.y,state,warp,camera.zoom,224);screen.x+=sample.dx;screen.y+=sample.dy;}
   const size=Math.max(.9,s.size*Math.min(1.4,camera.zoom));ctx.rect(screen.x,screen.y,size,size);cache.stats.stars++;

  }ctx.fill();
 }
 if(advanced)for(const tile of active)for(const s of tile.stars)if(s.galaxy){
  const p={x:s.x-origin.x,y:s.y-origin.y},screen=worldToScreen(camera,p);if(screen.x< -24||screen.y< -24||screen.x>camera.width+24||screen.y>camera.height+24)continue;
  if(warp.starWarp){sampleDisturbance(sample,p.x,p.y,state,warp,camera.zoom,224);screen.x+=sample.dx;screen.y+=sample.dy;}
  const r=Math.max(3.5,s.size*Math.min(1.4,camera.zoom)*2.8);ctx.save();ctx.translate(screen.x,screen.y);ctx.rotate(.55+s.brightness);ctx.scale(1,.32);
  const glow=ctx.createRadialGradient(0,0,0,0,0,r);glow.addColorStop(0,'#e6e1d5b0');glow.addColorStop(.16,'#aab5cf60');glow.addColorStop(.46,'#64739225');glow.addColorStop(1,'#34466a00');ctx.globalAlpha=.7;ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.restore();
 }ctx.restore();
 cache.stats.entries=cache.tiles.size;cache.stats.pending=cache.pending.length+Number(!!cache.busy);cache.stats.bytes=[...cache.tiles.values()].reduce((n,t)=>n+(t.texture?2*(t.res+2)**2*4:0),0)+w*h*4;
}
