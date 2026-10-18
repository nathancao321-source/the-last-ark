import type { Camera } from '../../camera/camera';
import { worldToScreen } from '../../camera/camera';
import type { Player } from '../../game/types';
import type { Source,VisualState } from './model';
import type { ArtConfig } from './art';
import type { Quality } from './config';
import { hash } from './noise';
import { NODE_FRAMES,NODE_SIZE } from './node-texture';
interface BlendedNode {canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D;image:ImageData;key:string}
export interface NodeAtlas {canvas:HTMLCanvasElement;ready:boolean;failed:boolean;generationMs:number;pixels?:Uint8ClampedArray;blends?:BlendedNode[]}
let atlas:NodeAtlas|undefined;
export function peekNodeAtlas():NodeAtlas|undefined{return atlas;}
/** One bounded 3 MiB atlas shared by resets/quality changes. No DOM on import. */
export function getNodeAtlas():NodeAtlas {
  if(atlas)return atlas;
  const canvas=document.createElement('canvas');canvas.width=NODE_SIZE*NODE_FRAMES;canvas.height=NODE_SIZE*2;
  const entry:NodeAtlas={canvas,ready:false,failed:false,generationMs:0};atlas=entry;
  const worker=new Worker(new URL('./node-worker.ts',import.meta.url),{type:'module'});
  worker.onmessage=(event:MessageEvent<{data:Uint8ClampedArray;ms:number}>)=>{const ctx=canvas.getContext('2d')!,image=ctx.createImageData(canvas.width,canvas.height);image.data.set(event.data.data);ctx.putImageData(image,0,0);entry.pixels=event.data.data;entry.ready=true;entry.generationMs=event.data.ms;worker.terminate();};
  worker.onerror=()=>{entry.failed=true;worker.terminate();};worker.postMessage(null);return entry;
}
export function particlePoint(source:Source,index:number,time:number):{x:number;y:number;alpha:number} {
  const age=(time*(.22+hash(index,2)*.15)+hash(index,3))%1,blue=source.field.polarity===1;
  const radius=blue?8+48*(1-age)**1.4:8+48*age**1.2;
  const angle=hash(index,4)*Math.PI*2+(blue?1:-.35)*age*(1.1+hash(index,5));
  return {x:source.position.x+Math.cos(angle)*radius,y:source.position.y+Math.sin(angle)*radius,alpha:Math.sin(age*Math.PI)**2*source.weight};
}
/** Tone map BEFORE interpolation. Independently clamping E*(1-b), E*b made
 * their sum oscillate between 1 and E every atlas frame for E > 1. */
export function nodeRadiance(energy:number,weight:number):{alpha:number;extent:number;activity:number} {
  const e=Number.isFinite(energy)?Math.max(0,energy):1,w=Number.isFinite(weight)?Math.max(0,Math.min(1,weight)):0;
  const gain=1-Math.exp(-e*.85);
  return {alpha:(.38+.52*gain)*(.76+.24*w),extent:1+.18*gain,activity:.45+.5*gain};
}
/** Blend material before rasterizing to the framebuffer. Two separate low-alpha
 * additive draws quantize twice, causing a dark dip at every atlas boundary.
 * Two fixed 128px buffers interpolate cached pixels; no noise or allocation/frame. */
function blendedSprite(cache:NodeAtlas,row:number,frame:number,blend:number):HTMLCanvasElement|undefined {
 if(!cache.pixels)return;
 cache.blends??=[];let buffer=cache.blends[row];
 if(!buffer){const canvas=document.createElement('canvas');canvas.width=canvas.height=NODE_SIZE;const ctx=canvas.getContext('2d')!;buffer={canvas,ctx,image:ctx.createImageData(NODE_SIZE,NODE_SIZE),key:''};cache.blends[row]=buffer;}
 const key=frame+':'+blend;if(buffer.key===key)return buffer.canvas;buffer.key=key;
 const pixels=cache.pixels,target=buffer.image.data,next=(frame+1)%NODE_FRAMES,stride=NODE_SIZE*NODE_FRAMES*4;
 for(let y=0;y<NODE_SIZE;y++)for(let x=0;x<NODE_SIZE;x++){
  const a=(row*NODE_SIZE+y)*stride+(frame*NODE_SIZE+x)*4,b=(row*NODE_SIZE+y)*stride+(next*NODE_SIZE+x)*4,i=(y*NODE_SIZE+x)*4;
  const left=pixels[a+3]*(1-blend),right=pixels[b+3]*blend,alpha=left+right;target[i+3]=alpha;
  for(let c=0;c<3;c++)target[i+c]=alpha>0?(pixels[a+c]*left+pixels[b+c]*right)/alpha:0;
 }
 buffer.ctx.putImageData(buffer.image,0,0);return buffer.canvas;
}
/** Draw-only energy projection. Never uses visual radius as a collider. */
export function drawNode(ctx:CanvasRenderingContext2D,cache:NodeAtlas,p:Player,s:Source,state:VisualState,camera:Camera,art:ArtConfig,quality:Quality,index:number):void {
  const pos=worldToScreen(camera,p.position),low=quality==='low',cycle=low?0:s.nodeClock*NODE_FRAMES,frame=Math.floor(cycle)%NODE_FRAMES,blend=cycle-Math.floor(cycle);
  const light=nodeRadiance(art.nodeEnergy,s.weight);
  const extent=Math.max(14,p.radius*3.8*camera.zoom)*light.extent,energy=light.alpha,row=index%2;
  ctx.save();ctx.globalCompositeOperation='lighter';
  const sprite=(f:number,x:number,y:number,r:number,a:number)=>{ctx.globalAlpha=a;ctx.drawImage(cache.canvas,f*NODE_SIZE,row*NODE_SIZE,NODE_SIZE,NODE_SIZE,x-r,y-r,r*2,r*2);};
  if(cache.ready){
    if(!low)for(let j=4;j>=1;j--){const h=((s.historyIndex-j+8)%8)*2,point=worldToScreen(camera,{x:s.history[h],y:s.history[h+1]});
      const fade=Math.min(1,Math.hypot(point.x-pos.x,point.y-pos.y)/extent);sprite(frame,point.x,point.y,extent*(1+j*.055),energy*.035*(1-j/5)*fade);}
    const image=low?undefined:blendedSprite(cache,row,frame,blend);
    if(image){ctx.globalAlpha=energy;ctx.drawImage(image,pos.x-extent,pos.y-extent,extent*2,extent*2);}
    else sprite(frame,pos.x,pos.y,extent,energy);
  }
  // A small, readable locating core remains at real position at distant LOD.
  ctx.globalAlpha=.95;ctx.fillStyle=index?'#ffe8aa':'#b9efff';ctx.beginPath();ctx.arc(pos.x,pos.y,Math.max(1.5,2.0*camera.zoom),0,Math.PI*2);ctx.fill();
  if(!low&&art.particles&&s.weight>.001){
    const count=quality==='high'?24:12;
    ctx.fillStyle=index?'#e9bd68':'#7cd9f6';
    for(let i=0;i<count;i++){const v=particlePoint(s,i,state.time),point=worldToScreen(camera,v);
      ctx.globalAlpha=v.alpha*light.activity;ctx.fillRect(point.x,point.y,Math.max(.6,camera.zoom*.85),Math.max(.6,camera.zoom*.85));}
  }ctx.restore();
}
