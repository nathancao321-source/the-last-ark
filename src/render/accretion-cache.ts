import {ACCRETION,accretionRate} from './accretion-model';
import type {AccretionBake,AccretionLayer} from './accretion-model';
interface LayerSurface {geometry:AccretionLayer;canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D;image:ImageData;colors:Float32Array}
interface AccretionCache {ready:boolean;failed:boolean;surfaces:LayerSurface[];bake?:AccretionBake;lastTime:number;frameMs:number;shifts:Float32Array;gains:Float32Array}
let cache:AccretionCache|undefined;
export function getAccretion():AccretionCache {
 if(cache)return cache;const entry:AccretionCache={ready:false,failed:false,surfaces:[],lastTime:NaN,frameMs:0,shifts:new Float32Array(ACCRETION.rows),gains:new Float32Array(ACCRETION.rows)};cache=entry;
 const worker=new Worker(new URL('./accretion-worker.ts',import.meta.url),{type:'module'});
 worker.onmessage=(e:MessageEvent<AccretionBake>)=>{entry.bake=e.data;entry.surfaces=e.data.layers.map(geometry=>{
  const canvas=document.createElement('canvas');canvas.width=ACCRETION.width;canvas.height=ACCRETION.height;const ctx=canvas.getContext('2d')!,colors=new Float32Array(geometry.rows.length*3);
  for(let n=0;n<geometry.rows.length;n++){const r=ACCRETION.inner+(ACCRETION.outer-ACCRETION.inner)*geometry.rows[n]/(ACCRETION.rows-1),hot=Math.exp(-(r-ACCRETION.inner)*.58),rim=geometry.name==='rim';colors[n*3]=rim?255:155+100*Math.sqrt(hot);colors[n*3+1]=rim?248:57+196*hot**.5;colors[n*3+2]=rim?224:12+238*hot**.95;}
  return {geometry,canvas,ctx,image:ctx.createImageData(canvas.width,canvas.height),colors};
 });entry.ready=true;worker.terminate();};
 worker.onerror=()=>{entry.failed=true;worker.terminate();};worker.postMessage(null);return entry;
}
/** Pixel lookup only; simulation time is the sole animation clock. */
export function prepareAccretion(time:number):AccretionCache {
 const entry=getAccretion();if(!entry.ready||entry.lastTime===time)return entry;const start=performance.now();entry.lastTime=time;
 const {rows,columns,inner,outer}=ACCRETION,material=entry.bake!.material;
 time=Number.isFinite(time)?Math.max(0,time):0;
 for(let row=0;row<rows;row++){const r=inner+(outer-inner)*row/(rows-1);entry.shifts[row]=(time*accretionRate(r)/(Math.PI*2)*columns)%columns;entry.gains[row]=.985+.015*Math.sin(time*.31+r*.7);}
 for(const layer of entry.surfaces){const {indices,angles,rows:bands,coverage}=layer.geometry,out=layer.image.data;
  for(let n=0;n<indices.length;n++){const i=indices[n],band=bands[n],row=Math.min(rows-2,Math.floor(band)),radial=band-row;
   const u=(angles[n]-entry.shifts[row]+columns)%columns,k=Math.floor(u),f=u-k,uu=(angles[n]-entry.shifts[row+1]+columns)%columns,kk=Math.floor(uu),ff=uu-kk;
   const a=material[row*columns+k]*(1-f)+material[row*columns+(k+1)%columns]*f,b=material[(row+1)*columns+kk]*(1-ff)+material[(row+1)*columns+(kk+1)%columns]*ff,brightness=(a*(1-radial)+b*radial)*entry.gains[row]*1.14;
   out[i]=layer.colors[n*3]*brightness;out[i+1]=layer.colors[n*3+1]*brightness;out[i+2]=layer.colors[n*3+2]*brightness;out[i+3]=coverage[n]*255;
  }layer.ctx.putImageData(layer.image,0,0);
 }entry.frameMs=performance.now()-start;return entry;
}
export function accretionStats(){return cache?{ready:cache.ready,failed:cache.failed,bakeMs:cache.bake?.ms,frameMs:cache.frameMs,layers:cache.surfaces.map(l=>({name:l.geometry.name,pixels:l.geometry.indices.length})),width:ACCRETION.width,height:ACCRETION.height}:undefined;}
