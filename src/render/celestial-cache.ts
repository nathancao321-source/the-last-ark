import type {CelestialTexture} from './celestial-texture';
export interface Material {canvas:HTMLCanvasElement;ready:boolean;ms:number}
const cache=new Map<CelestialTexture,Material>();let worker:Worker|undefined;
/** Six bounded textures shared by scene retries. No cache is allocated by fx=off. */
export function celestialMaterial(kind:CelestialTexture):Material {
 const old=cache.get(kind);if(old)return old;const width=kind==='accretion'?1024:512,height=512;
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const entry={canvas,ready:false,ms:0};cache.set(kind,entry);
 if(!worker){worker=new Worker(new URL('./celestial-worker.ts',import.meta.url),{type:'module'});worker.onmessage=(event:MessageEvent<{kind:CelestialTexture;width:number;height:number;pixels:Uint8ClampedArray;ms:number}>)=>{const data=event.data,item=cache.get(data.kind)!;const ctx=item.canvas.getContext('2d')!,image=ctx.createImageData(data.width,data.height);image.data.set(data.pixels);ctx.putImageData(image,0,0);item.ready=true;item.ms=data.ms;};}
 worker.postMessage({kind,width,height});return entry;
}
export function celestialCacheStats(){return [...cache.entries()].map(([kind,v])=>({kind,ready:v.ready,ms:v.ms,bytes:v.canvas.width*v.canvas.height*4}));}
