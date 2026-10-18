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
    const mist=dense?d.filament:Math.pow(d.cloud,1.5)*.65;
    const v=a.nebula*Math.max(0,mist*(1-d.dust*1.8)*(.9+.1*worldFabric(x*TILE/size,y*TILE/size))),cloud=a.nebula*d.cloud*(dense?.24:.13);
    const tint=fbm(nx*.4+7,ny*.4,3,77),grain=(fbm(nx*22,ny*22,2)-.5)*v*8,i=(y*size+x)*4;
    data[i]=(2+v*(38+20*tint)+cloud*28+grain)*a.exposure;
    data[i+1]=(3+v*(39-9*tint)+cloud*25+grain)*a.exposure;
    data[i+2]=(7+v*(83+12*tint)+cloud*66+grain)*a.exposure;data[i+3]=255;
  }return seamlessTexture(data,size);
}

/** Periodic crossfade into the half-tile-shifted material near each edge.
 * Weights sum to one: no black border, exposure loss, or camera-dependent UV.
 * The shifted copy's own discontinuity is in the interior where its weight is 0.
 * Runs once in the texture worker, not on the rendering path. */
export function seamlessTexture(raw:Uint8ClampedArray,size:number):Uint8ClampedArray {
  const result=new Uint8ClampedArray(raw.length),weights=new Float32Array(size),shift=Math.floor(size/2);
  for(let i=0;i<size;i++){const t=Math.min(1,Math.min(i,size-i)/(size*.12));weights[i]=t*t*(3-2*t);}
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const sx=(x+shift)%size,sy=(y+shift)%size,wx=weights[x],wy=weights[y],i=(y*size+x)*4;
    for(let c=0;c<4;c++)result[i+c]=
      raw[i+c]*wx*wy+raw[(y*size+sx)*4+c]*(1-wx)*wy+
      raw[(sy*size+x)*4+c]*wx*(1-wy)+raw[(sy*size+sx)*4+c]*(1-wx)*(1-wy);
  }return result;
}
