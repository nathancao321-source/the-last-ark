import type { Camera } from '../../camera/camera';
import { worldToScreen,screenToWorld,viewBounds } from '../../camera/camera';
import type { Player } from '../../game/types';
import { seededRandom } from '../../world/sectors';
import { SPACE } from '../palette';
import { BUDGET,enabled } from './config';
import type { WarpConfig } from './config';
import { sampleDisturbance } from './model';
import type { Sample, VisualState } from './model';
import type { ArtConfig } from './art';
import { createBackground,backgroundKey,drawBackground } from './background';
import type { BackgroundCache } from './background';
import { getNodeAtlas,drawNode } from './nodes';

type Surface=HTMLCanvasElement|OffscreenCanvas;
interface Cell {x:number;y:number}
interface Grid {spacing:number;cells:Cell[];samples:Float32Array;neighbors:Int16Array}
interface Cache {dark:Surface;light:Surface;blue:Surface;gold:Surface}
export interface DemoRenderer {stars:Float32Array;background?:BackgroundCache;cache?:Cache;grid:Grid;previous?:Grid;geometryKey:string;blend:number;time:number;scale:number;revision:number;sample:Sample;stats:{samples:number;cells:number;vertices:number;cacheEntries:number}}
function makeGrid(spacing:number,cells:Cell[]):Grid {
  const indices=new Map(cells.map((cell,i)=>[cell.x+','+cell.y,i])),neighbors=new Int16Array(cells.length);
  for(let i=0;i<cells.length;i++)neighbors[i]=indices.get((cells[i].x+spacing)+','+cells[i].y)??-1;
  return {spacing,cells,neighbors,samples:new Float32Array(cells.length*3)};
}
export function createDemoRenderer():DemoRenderer {
  const random=seededRandom(9511),stars=new Float32Array(360*4);
  for(let i=0;i<stars.length;i+=4){stars[i]=random()*900;stars[i+1]=random()*900;stars[i+2]=Math.floor(random()*3);stars[i+3]=0.65+random()*0.85;}
  return {stars,grid:makeGrid(112,[]),geometryKey:'',blend:1,time:0,scale:224,revision:-1,sample:{dx:0,dy:0,luminance:0},stats:{samples:0,cells:0,vertices:0,cacheEntries:0}};
}
function surface(size:number):Surface {const c=document.createElement('canvas');c.width=size;c.height=size;return c;}
function kernel(color:string):Surface {
  const c=surface(64),ctx=c.getContext('2d') as CanvasRenderingContext2D,data=ctx.createImageData(64,64);
  const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
  for(let y=0;y<64;y++)for(let x=0;x<64;x++) {
    const a=Math.abs((x+0.5-32)/32),b=Math.abs((y+0.5-32)/32),h=(v:number)=>1-v*v*(3-2*v),i=(y*64+x)*4;
    data.data[i]=rgb[0];data.data[i+1]=rgb[1];data.data[i+2]=rgb[2];data.data[i+3]=Math.round(255*h(a)*h(b));
  }
  ctx.putImageData(data,0,0);return c;
}
function halo(color:string):Surface {
  const c=surface(128),ctx=c.getContext('2d') as CanvasRenderingContext2D,g=ctx.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,color);g.addColorStop(0.25,color);g.addColorStop(1,SPACE.clear);ctx.fillStyle=g;ctx.fillRect(0,0,128,128);return c;
}
function ensureCache(r:DemoRenderer):Cache {
  return r.cache??= {dark:kernel(SPACE.dark),light:kernel(SPACE.light),blue:halo(SPACE.blueHalo),gold:halo(SPACE.goldHalo)};
}
/** Bounded world-anchored mesh, never a screen-anchored texture. A grid change
 * crossfades two lists whose combined capacity is bounded by the quality budget. */
function collectGrid(state:VisualState,c:WarpConfig,camera:Camera,spacing:number,capacity:number):Grid|undefined {
  const cells:Cell[]=[],seen=new Set<string>();
  const regions=state.sources.filter(s=>s.weight>1e-5).map(s=>({x:s.position.x,y:s.position.y,r:s.field.radius}));
  if(c.interaction)for(const e of state.events)if(e.alive)regions.push({x:e.origin.x,y:e.origin.y,r:e.radius});
  const a=screenToWorld(camera,{x:-spacing*camera.zoom,y:-spacing*camera.zoom}),b=screenToWorld(camera,{x:camera.width+spacing*camera.zoom,y:camera.height+spacing*camera.zoom});
  for(const region of regions) {
    const x0=Math.max(Math.ceil((region.x-region.r)/spacing),Math.ceil(a.x/spacing)),x1=Math.min(Math.floor((region.x+region.r)/spacing),Math.floor(b.x/spacing));
    const y0=Math.max(Math.ceil((region.y-region.r)/spacing),Math.ceil(a.y/spacing)),y1=Math.min(Math.floor((region.y+region.r)/spacing),Math.floor(b.y/spacing));
    for(let iy=y0;iy<=y1;iy++)for(let ix=x0;ix<=x1;ix++) {
      const x=ix*spacing,y=iy*spacing,key=ix+','+iy;
      if(Math.hypot(x-region.x,y-region.y)>region.r||seen.has(key))continue;
      seen.add(key);cells.push({x,y});if(cells.length>capacity)return;
    }
  }
  return makeGrid(spacing,cells);
}
function updateGrid(r:DemoRenderer,state:VisualState,c:WarpConfig,camera:Camera):void {
  const capacity=BUDGET[c.quality]/2,dt=Math.max(0,state.time-r.time);r.time=state.time;
  if(r.revision!==state.revision){r.grid=makeGrid(112,[]);r.geometryKey='';r.previous=undefined;r.blend=1;r.revision=state.revision;}
  if(r.previous){r.blend=Math.min(1,r.blend+dt/0.45);if(r.blend===1)r.previous=undefined;}
  r.scale+=(2*Math.max(r.grid.spacing,r.previous?.spacing??0)-r.scale)*(1-Math.exp(-dt/0.35));
  const key=c.quality+':'+c.interaction+':'+[camera.position.x,camera.position.y,camera.width,camera.height,camera.zoom].join(',')
    +state.sources.map(s=>[s.position.x,s.position.y,s.weight>1e-5].join(',')).join(';')
    +state.events.map(e=>e.alive?[e.origin.x,e.origin.y,e.radius].join(','):'-').join(';');
  if(r.geometryKey===key||r.previous)return;
  let spacing=112,next:Grid|undefined;
  for(let level=0;level<9&&!next;level++,spacing*=1.5)next=collectGrid(state,c,camera,spacing,capacity);
  if(!next)return;
  r.geometryKey=key;
  if(next.spacing!==r.grid.spacing&&!r.previous&&r.grid.cells.length){r.previous=r.grid;r.blend=0;r.grid=next;}
  else if(!r.previous)r.grid=next;
  // During a crossfade freeze both spatial grids, not the shared visual model.
}
function drawGrid(ctx:CanvasRenderingContext2D,r:DemoRenderer,grid:Grid,alpha:number,state:VisualState,c:WarpConfig,camera:Camera,scale:number):void {
  const cache=ensureCache(r),half=grid.spacing*camera.zoom;
  const points=grid.samples;
  for(let i=0;i<grid.cells.length;i++) {
    const cell=grid.cells[i];
    const y=cell.y+grid.spacing*0.4*Math.sin(cell.x/190+Math.sin(cell.y/270));
    const sample=sampleDisturbance(r.sample,cell.x,y,state,c,camera.zoom,scale);r.stats.samples++;
    const sx=(cell.x-camera.position.x)*camera.zoom+camera.width/2,sy=(y-camera.position.y)*camera.zoom+camera.height/2;
    points[i*3]=sx+sample.dx;points[i*3+1]=sy+sample.dy;points[i*3+2]=sample.luminance;
    if(Math.abs(sample.luminance)<0.00001)continue;
    ctx.globalAlpha=Math.abs(sample.luminance)*alpha*0.3;
    ctx.drawImage(sample.luminance<0?cache.dark:cache.light,sx-half,sy-half,half*2,half*2);r.stats.cells++;
  }
  // Broad curved shoulders connect neighboring samples into fabric, rather than
  // displaying isolated Gaussian spots. They read the very same B and D samples.
  // Six sub-pixel-contrast feather layers prevent hard-edged ribbon silhouettes.
  // Even a mesh crossfade stays below 180 Canvas submissions per frame.
  ctx.lineCap='round';
  for(const sign of [-1,1])for(let bucket=0;bucket<3;bucket++)for(let layer=0;layer<6;layer++) {
    ctx.strokeStyle=sign<0?SPACE.dark:SPACE.light;ctx.lineWidth=half*(0.9-layer*0.14);
    ctx.globalAlpha=(bucket+0.5)/3*(sign<0?0.1:0.06)*alpha*(0.7/6);ctx.beginPath();
    for(let i=0;i<grid.cells.length;i++) {
      const neighbor=grid.neighbors[i];if(neighbor<0)continue;
      const a=i*3,b=neighbor*3,value=(points[a+2]+points[b+2])/2;
      if(value*sign<=0||Math.min(2,Math.floor(Math.abs(value)/(sign<0?0.1:0.06)*3))!==bucket||Math.abs(value)<0.003)continue;
      ctx.moveTo(points[a],points[a+1]);ctx.bezierCurveTo(points[a]+half/3,points[a+1],points[b]-half/3,points[b+1],points[b],points[b+1]);
    }
    ctx.stroke();
  }
}
/** All coordinates are CSS pixels; caller applies DPR once. Physics and camera
 * are read only. fx=off exits every advanced draw/cache/sample path. */
export function drawDemo(ctx:CanvasRenderingContext2D,r:DemoRenderer,players:readonly Player[],camera:Camera,state:VisualState,c:WarpConfig,art?:ArtConfig):void {
  r.stats.samples=0;r.stats.cells=0;r.stats.vertices=0;
  const fx=enabled(c),cinematic=art&&art.background!=='baseline'&&c.quality!=='off';
  if(fx&&(c.luminance||c.starWarp))updateGrid(r,state,c,camera);
  const scale=r.scale;
  ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.fillStyle=SPACE.background;ctx.fillRect(0,0,camera.width,camera.height);
  if(cinematic){
    if(!r.background||r.background.key!==backgroundKey(art))r.background=createBackground(art,r.background?.stars);
    const stats=drawBackground(ctx,r.background,camera,state,c,art,r.sample);r.stats.samples+=stats.samples;r.stats.vertices+=stats.vertices;r.stats.cells+=stats.cells;
  }
  // A/B shares the same world plane. Camera motion never changes a star's
  // source coordinate, including in the inexpensive technical baseline.
  const bounds=viewBounds(camera),padding=42/camera.zoom;
  const stride=2**Math.max(0,Math.ceil(Math.log2(Math.max(camera.width,camera.height)/camera.zoom/900/4)));
  if(!cinematic)for(let bucket=0;bucket<3;bucket++) {
    ctx.fillStyle=SPACE.stars[bucket];ctx.beginPath();
    for(let ty=Math.floor((bounds.minY-padding)/900/stride)*stride;ty<=Math.floor((bounds.maxY+padding)/900);ty+=stride)for(let tx=Math.floor((bounds.minX-padding)/900/stride)*stride;tx<=Math.floor((bounds.maxX+padding)/900);tx+=stride) {
      for(let i=0;i<r.stars.length;i+=4)if(r.stars[i+2]===bucket) {
        const wx=r.stars[i]+tx*900,wy=r.stars[i+1]+ty*900,screen=worldToScreen(camera,{x:wx,y:wy});
        let x=screen.x,y=screen.y;
        if(x< -42||y< -42||x>camera.width+42||y>camera.height+42)continue;
        if(fx&&c.starWarp){const s=sampleDisturbance(r.sample,wx,wy,state,c,camera.zoom,scale);x+=s.dx;y+=s.dy;r.stats.samples++;}
        const size=Math.max(.3,r.stars[i+3]*camera.zoom);ctx.rect(x,y,size,size);r.stats.vertices++;
      }
    }
    ctx.fill();
  }
  if(!cinematic&&fx&&c.luminance) {
    if(r.previous)drawGrid(ctx,r,r.previous,1-r.blend,state,c,camera,scale);
    drawGrid(ctx,r,r.grid,r.blend,state,c,camera,scale);ctx.globalAlpha=1;
  }
  for(let i=0;i<players.length;i++) {
    const p=players[i],screen=worldToScreen(camera,p.position),radius=p.radius*camera.zoom;
    if(cinematic)drawNode(ctx,getNodeAtlas(),p,state.sources[i],state,camera,art,c.quality,i);
    else {
    if(fx){const cache=ensureCache(r);ctx.globalCompositeOperation='lighter';ctx.globalAlpha=0.15+0.4*state.sources[i].weight;
      ctx.drawImage(i?cache.gold:cache.blue,screen.x-radius*5.5,screen.y-radius*5.5,radius*11,radius*11);
      ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';}
    ctx.fillStyle=i?SPACE.gold:SPACE.blue;ctx.beginPath();ctx.arc(screen.x,screen.y,radius,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle=SPACE.text;ctx.font='11px monospace';ctx.textAlign='center';ctx.fillText(i?'P2 / ENTER':'P1 / F',screen.x,screen.y+radius+23);
  }
  r.stats.cacheEntries=(r.cache?4:0)+(r.background?2+(r.background.shades?2:0):0)+(cinematic?1:0);ctx.restore();
}
