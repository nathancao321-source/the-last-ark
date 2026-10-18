import type { Camera } from '../../camera/camera';
import { worldToScreen } from '../../camera/camera';
import type { Player } from '../../game/types';
import type { Source,VisualState } from './model';
import type { ArtConfig } from './art';
import type { Quality } from './config';
import { hash } from './noise';
import { NODE_FRAMES,NODE_SIZE } from './node-texture';
export interface NodeAtlas {canvas:HTMLCanvasElement;ready:boolean;failed:boolean;generationMs:number}
let atlas:NodeAtlas|undefined;
export function peekNodeAtlas():NodeAtlas|undefined{return atlas;}
/** One bounded 3 MiB atlas shared by resets/quality changes. No DOM on import. */
export function getNodeAtlas():NodeAtlas {
  if(atlas)return atlas;
  const canvas=document.createElement('canvas');canvas.width=NODE_SIZE*NODE_FRAMES;canvas.height=NODE_SIZE*2;
  const entry:NodeAtlas={canvas,ready:false,failed:false,generationMs:0};atlas=entry;
  const worker=new Worker(new URL('./node-worker.ts',import.meta.url),{type:'module'});
  worker.onmessage=(event:MessageEvent<{data:Uint8ClampedArray;ms:number}>)=>{const ctx=canvas.getContext('2d')!,image=ctx.createImageData(canvas.width,canvas.height);image.data.set(event.data.data);ctx.putImageData(image,0,0);entry.ready=true;entry.generationMs=event.data.ms;worker.terminate();};
  worker.onerror=()=>{entry.failed=true;worker.terminate();};worker.postMessage(null);return entry;
}
export function particlePoint(source:Source,index:number,time:number):{x:number;y:number;alpha:number} {
  const age=(time*(.22+hash(index,2)*.15)+hash(index,3))%1,blue=source.field.polarity===1;
  const radius=blue?8+48*(1-age)**1.4:8+48*age**1.2;
  const angle=hash(index,4)*Math.PI*2+(blue?1:-.35)*age*(1.1+hash(index,5));
  return {x:source.position.x+Math.cos(angle)*radius,y:source.position.y+Math.sin(angle)*radius,alpha:Math.sin(age*Math.PI)**2*source.weight};
}
/** Draw-only energy projection. Never uses visual radius as a collider. */
export function drawNode(ctx:CanvasRenderingContext2D,cache:NodeAtlas,p:Player,s:Source,state:VisualState,camera:Camera,art:ArtConfig,quality:Quality,index:number):void {
  const pos=worldToScreen(camera,p.position),low=quality==='low',cycle=low?0:s.nodeClock*NODE_FRAMES,frame=Math.floor(cycle)%NODE_FRAMES,blend=cycle-Math.floor(cycle);
  const extent=Math.max(14,p.radius*3.8*camera.zoom),energy=Math.min(1.7,art.nodeEnergy*(.68+.32*s.weight)),row=index%2;
  ctx.save();ctx.globalCompositeOperation='lighter';
  const sprite=(f:number,x:number,y:number,r:number,a:number)=>{ctx.globalAlpha=Math.min(1,a);ctx.drawImage(cache.canvas,f*NODE_SIZE,row*NODE_SIZE,NODE_SIZE,NODE_SIZE,x-r,y-r,r*2,r*2);};
  if(cache.ready){
    if(!low)for(let j=4;j>=1;j--){const h=((s.historyIndex-j+8)%8)*2,point=worldToScreen(camera,{x:s.history[h],y:s.history[h+1]});
      if(Math.hypot(point.x-pos.x,point.y-pos.y)<3)continue;sprite(frame,point.x,point.y,extent*(1+j*.055),energy*.08*(1-j/5));}
    sprite(frame,pos.x,pos.y,extent,energy*(low?1:1-blend));if(!low)sprite((frame+1)%NODE_FRAMES,pos.x,pos.y,extent,energy*blend);
  }
  // A small, readable locating core remains at real position at distant LOD.
  ctx.globalAlpha=.95;ctx.fillStyle=index?'#ffe8aa':'#b9efff';ctx.beginPath();ctx.arc(pos.x,pos.y,Math.max(1.5,2.0*camera.zoom),0,Math.PI*2);ctx.fill();
  if(!low&&art.particles&&s.weight>.001){
    const count=quality==='high'?24:12;
    for(let bucket=0;bucket<3;bucket++) {ctx.beginPath();ctx.globalAlpha=(bucket+.5)/3*.65;ctx.fillStyle=index?'#e9bd68':'#7cd9f6';
      for(let i=0;i<count;i++){const v=particlePoint(s,i,state.time);if(Math.min(2,Math.floor(v.alpha*3))!==bucket||v.alpha<.03)continue;
        const point=worldToScreen(camera,v);ctx.rect(point.x,point.y,Math.max(.6,camera.zoom*.85),Math.max(.6,camera.zoom*.85));}
      ctx.fill();
    }
  }ctx.restore();
}
