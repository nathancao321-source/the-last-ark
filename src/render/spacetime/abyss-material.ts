import {fbm,noise} from './noise';
import type {ArtConfig} from './art';
import {lensSample} from './lensing';
import type {LensSource} from './lensing';

export const ABYSS_TILE=1024,ABYSS_RES=192,ABYSS_GUTTER=1,ABYSS_CAPACITY=48;
export interface AbyssTileRequest {key:string;x:number;y:number;span:number;art:ArtConfig;lens?:LensSource}
/** Global, nonperiodic material. Adjacent chunks share samples, including gutters.
 * No camera, time, tile seed, rotation, or edge fading enters this density field. */
export function abyssColor(wx:number,wy:number,a:ArtConfig):readonly number[] {
 const x=wx/680,y=wy/680;
 const warpX=x+2.4*(fbm(x*.41,y*.41,3,812)-.5),warpY=y+2.4*(fbm(x*.41+29,y*.41,3,381)-.5);
 const n=fbm(warpX,warpY,5,301)+.035*(fbm(warpX*9,warpY*9,2,610)-.5),ridge=Math.exp(-Math.abs(n-.48)*30);
 const macro=fbm(x*.18,y*.18,3,1703),cloud=Math.max(0,macro-.28);
 const dust=Math.max(0,fbm(warpX*.9+7,warpY*.9,3,71)-.49);
 const detail=fbm(warpX*4,warpY*4,3,99);
 const thread=Math.exp(-Math.abs(fbm(warpX*2.9,warpY*2.9,4,209)-.51)*44);
 const filament=(ridge*.76+thread*.24)*(.19+cloud*1.9)*(.55+detail*.65);
 const v=a.nebula*(filament*.47+cloud*.30)*Math.max(.15,1-dust*3.8),tint=noise(x*.32,y*.32,814);
 return [(2+v*(36+13*tint))*a.exposure,(3+v*(29+9*tint))*a.exposure,(7+v*(80+24*tint))*a.exposure];
}
export function generateAbyssTile(request:AbyssTileRequest):Uint8ClampedArray {
 const size=ABYSS_RES+ABYSS_GUTTER*2,data=new Uint8ClampedArray(size*size*4),step=request.span/ABYSS_RES;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const wx=request.x+(x-ABYSS_GUTTER+.5)*step,wy=request.y+(y-ABYSS_GUTTER+.5)*step;
  const sample=request.lens?lensSample({x:wx,y:wy},request.lens):{x:wx,y:wy};
  const color=abyssColor(sample.x,sample.y,request.art),i=(y*size+x)*4;
  data[i]=color[0];data[i+1]=color[1];data[i+2]=color[2];data[i+3]=255;
 }
 return data;
}
