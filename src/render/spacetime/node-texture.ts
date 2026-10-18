import { fbm,noise } from './noise';
export const NODE_SIZE=128,NODE_FRAMES=24;
/** Round energy cloud: Cartesian domain drift and tiny radial advection only.
 * No angular coordinate, angular harmonics or rotating texture. A radial floor
 * keeps every sector present; low-contrast noise provides internal volume. */
export function nodeFrame(polarity:1|-1,frame:number,size=NODE_SIZE):Uint8ClampedArray {
  const data=new Uint8ClampedArray(size*size*4),phase=(frame%NODE_FRAMES)/NODE_FRAMES*Math.PI*2;
  for(let py=0;py<size;py++)for(let px=0;px<size;px++) {
    const x=(px+.5-size/2)/(size/2),y=(py+.5-size/2)/(size/2),r=Math.hypot(x,y);if(r>=1)continue;
    const radial=1+.065*Math.sin(phase-polarity*r*3);
    const wx=x*radial*5+.12*Math.sin(phase+y*2),wy=y*radial*5+.12*Math.cos(phase+x*2);
    const n=fbm(wx+11,wy+9,5,polarity===1?873:318),fine=noise(wx*3+3,wy*3,91);
    const edge=(1-r*r)**3;
    const body=Math.exp(-r*r*6)*(.24+.85*n+.22*fine);
    const halo=Math.exp(-r*r*2.5)*.14*(.88+.12*n);
    const fog=(body+halo)*edge;
    const core=Math.exp(-r*r/.007)*(1-.08*fine),heat=Math.min(1,core+fog*.13),alpha=Math.min(1,fog*.78+core);
    const i=(py*size+px)*4;
    if(polarity===1){data[i]=28+heat*202;data[i+1]=110+heat*136;data[i+2]=207+heat*48;}
    else {data[i]=222+heat*33;data[i+1]=105+heat*141;data[i+2]=19+heat*194;}
    data[i+3]=Math.round(alpha*255);
  }return data;
}
