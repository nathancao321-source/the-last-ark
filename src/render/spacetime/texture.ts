import type { ArtConfig } from './art';
import { fbm,nebulaDensity,worldFabric } from './noise';
import { seededRandom } from '../../world/sectors';
export const TILE=2400,RES=1024;
export function generateStars(seed=4801):Float32Array {
  const random=seededRandom(seed),points:number[]=[];
  for(let i=0;i<32000&&points.length<11000*5;i++) {
    const x=random()*TILE,y=random()*TILE,d=nebulaDensity(x/180,y/180);
    if(random()>.24+d.filament*.85)continue;
    points.push(x,y,random(),random(),random());
  }return Float32Array.from(points);
}
export function generateNebula(a:ArtConfig,size=RES):Uint8ClampedArray {
  const data=new Uint8ClampedArray(size*size*4),dense=a.background==='dense';
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const nx=x*TILE/size/180,ny=y*TILE/size/180,d=nebulaDensity(nx,ny);
    const edge=Math.min(1,x/(size*.06),y/(size*.06),(size-1-x)/(size*.06),(size-1-y)/(size*.06)),fade=edge*edge*(3-2*edge);
    const mist=dense?d.filament:Math.pow(d.cloud,1.5)*.65;
    const v=a.nebula*fade*Math.max(0,mist*(1-d.dust*1.8)*(.9+.1*worldFabric(x*TILE/size,y*TILE/size))),cloud=a.nebula*fade*d.cloud*(dense?.24:.13);
    const tint=fbm(nx*.4+7,ny*.4,3,77),grain=(fbm(nx*22,ny*22,2)-.5)*v*8,i=(y*size+x)*4;
    data[i]=(2+v*(38+20*tint)+cloud*28+grain)*a.exposure;
    data[i+1]=(3+v*(39-9*tint)+cloud*25+grain)*a.exposure;
    data[i+2]=(7+v*(83+12*tint)+cloud*66+grain)*a.exposure;data[i+3]=255;
  }return data;
}
