import {noise} from './spacetime/noise';
export const ACCRETION={inner:1.008,outer:4.8,width:768,height:384,extentX:4.95,extentY:2.35,columns:1024,rows:128} as const;
export type AccretionLayerName='rear'|'disc'|'rim';
export interface AccretionLayer {name:AccretionLayerName;indices:Uint32Array;angles:Float32Array;rows:Float32Array;coverage:Float32Array}
export interface AccretionBake {layers:AccretionLayer[];material:Float32Array;ms:number}
const TAU=Math.PI*2,clamp=(n:number)=>Math.max(0,Math.min(1,n));
/** Artistic orbital rates in radians/s, shared by direct and bent images. */
export function accretionRate(radius:number):number{return 1.15/Math.max(ACCRETION.inner,radius)**1.5;}
export function rearHeight(x:number,radius:number):number {
 const dr=Math.max(0,radius-ACCRETION.inner),h=ACCRETION.inner+.3*dr;
 return h*Math.sqrt(Math.max(0,1-(x/radius)**2))*Math.exp(-.52*(Math.abs(x)/(1.5+.1*radius))**4*(1-Math.exp(-dr*2)));
}
export function accretionCoordinates(name:AccretionLayerName,x:number,y:number):{radius:number;angle:number;coverage:number}|undefined {
 const d=Math.hypot(x,y);if(d<1)return;
 if(name==='rim'){if(d>1.19)return;return {radius:ACCRETION.inner+(d-1)*2,angle:Math.atan2(y,x),coverage:Math.exp(-(((d-1.025)/.055)**2))*.96};}
 if(name==='disc'){
  const yy=(y+x*.072)/.3,radius=Math.hypot(x,yy);if(radius<ACCRETION.inner||radius>ACCRETION.outer)return;
  return {radius,angle:Math.atan2(yy,x),coverage:clamp((ACCRETION.outer-radius)/.9)*clamp((radius-ACCRETION.inner)/.12)*(.95-.29*(radius-1)/(ACCRETION.outer-1))};
 }
 const height=-(y+x*.055),near=Math.max(ACCRETION.inner,Math.abs(x));
 if(near>=ACCRETION.outer||height<rearHeight(x,near)||height>rearHeight(x,ACCRETION.outer))return;
 let lo:number=near,hi:number=ACCRETION.outer;for(let n=0;n<14;n++){const mid=(lo+hi)*.5;if(rearHeight(x,mid)<height)lo=mid;else hi=mid;}
 const radius=(lo+hi)*.5,shoulder=Math.abs(x)>1?clamp((height-rearHeight(x,near))/.09):1;return {radius,angle:Math.atan2(-Math.sqrt(Math.max(0,radius*radius-x*x)),x),coverage:shoulder*clamp((ACCRETION.outer-radius)/.8)*(.94-.1*(radius-1)/(ACCRETION.outer-1))};
}
/** Worker-only geometry lookup and periodic polar gas atlas; no frame noise. */
export function bakeAccretion():AccretionBake {
 const start=performance.now(),{width,height,extentX,extentY,columns,rows,inner,outer}=ACCRETION,material=new Float32Array(columns*rows);
 for(let row=0;row<rows;row++){const radius=inner+(outer-inner)*row/(rows-1);
  for(let col=0;col<columns;col++){const a=col/columns*TAU,c=Math.cos(a),s=Math.sin(a),warp=(noise(c*2+radius,s*2+11,191)-.5)*.07;
   const streak=noise((radius+warp)*91,c*1.7+s*.8,813),fine=noise(radius*187,c*4+s*3,401),clump=noise(c*3.5+radius*1.8,s*3.5-radius*.7,771),gas=noise(c*8+radius,s*8+radius*2,72);
   material[row*columns+col]=.28+.44*streak+.1*fine+.48*clump+.14*gas;
  }
 }
 const layers=(['rear','disc','rim'] as const).map(name=>{const indices:number[]=[],angles:number[]=[],bands:number[]=[],coverage:number[]=[];
  for(let py=0;py<height;py++)for(let px=0;px<width;px++){const x=((px+.5)/width*2-1)*extentX,y=((py+.5)/height*2-1)*extentY,p=accretionCoordinates(name,x,y);if(!p||p.coverage<.002)continue;
   indices.push((py*width+px)*4);angles.push(((p.angle/TAU+1)%1)*columns);bands.push(clamp((p.radius-inner)/(outer-inner))*(rows-1));coverage.push(p.coverage);
  }return {name,indices:Uint32Array.from(indices),angles:Float32Array.from(angles),rows:Float32Array.from(bands),coverage:Float32Array.from(coverage)};
 });return {layers,material,ms:performance.now()-start};
}
