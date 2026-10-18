import {fbm,noise,hash} from './spacetime/noise';
export type CelestialTexture='sun'|'corona'|'neutron'|'cold-corona'|'accretion'|'portal';
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
export function granulation(x:number,y:number):number {
 let first=10,second=10;const ix=Math.floor(x),iy=Math.floor(y);
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=ix+dx,yy=iy+dy,d=Math.hypot(x-xx-hash(xx,yy,71),y-yy-hash(xx,yy,127));if(d<first){second=first;first=d;}else if(d<second)second=d;}
 return clamp((second-first)*3.7);
}
/** Deterministic 2D materials, generated once in a worker. No frame randomness. */
export function celestialPixels(kind:CelestialTexture,width:number,height:number):Uint8ClampedArray {
 const data=new Uint8ClampedArray(width*height*4);
 for(let py=0;py<height;py++)for(let px=0;px<width;px++){
  const x=(px+.5-width/2)/(width/2),y=(py+.5-height/2)/(height/2),r=Math.hypot(x,y),i=(py*width+px)*4;let red=0,green=0,blue=0,alpha=0;
  if(kind==='sun'||kind==='neutron'){
   if(r>=1)continue;const z=Math.sqrt(1-r*r),limb=.48+.52*z;
   const warp=fbm(x*5+30,y*5+30,4,891),cloud=fbm(x*9+warp,y*9-warp,5,73);
   const fine=granulation(x*100+100,y*100+100),detail=noise(x*210,y*210,901);
   const hot=clamp(.3+cloud*.75+fine*.17),spot=Math.exp(-((x+.27)**2/.008+(y-.17)**2/.004))+.6*Math.exp(-((x-.39)**2/.002+(y+.29)**2/.004));
   const intensity=clamp((.7+.3*hot)*limb-spot*.44);
   if(kind==='sun'){red=(220+hot*35)*intensity;green=(88+hot*132+detail*10)*intensity;blue=(16+hot*70)*intensity;}
   else{const grain=.82+cloud*.24+fine*.04;red=(155+hot*67)*limb*grain;green=(193+hot*48)*limb*grain;blue=(227+hot*27)*limb*grain;}
   alpha=clamp((1-r)*width/2);
  }else if(kind==='corona'||kind==='cold-corona'){
   const rr=r*2.15;if(rr<.97||rr>2.13)continue;const a=Math.atan2(y,x),out=rr-1;
   const ca=Math.cos(a),sa=Math.sin(a),stream=noise(ca*8+20,sa*8+20,125);
   const curl=noise(x*9,y*9,831),strand=fbm(ca*73+curl*2+out*.5,sa*73+curl*2-out*.7,3,118)**3;
   const gas=fbm(x*18,y*18,4,442),v=Math.exp(-out*(6.8-stream*4.8))*(.08+strand*2.4+gas*.24)*(.28+stream*.85)*clamp((2.13-rr)*3);
   red=kind==='corona'?255:103;green=kind==='corona'?148:171;blue=kind==='corona'?51:255;alpha=clamp(v*.68);
  }else if(kind==='accretion'){
   const xx=x*4.8,yy=y*2.5,rad=Math.hypot(xx,yy),tilted=yy+xx*.085;
   // P1: a broad rear image bends up, with smooth shoulders into dusty wings.
   // Anisotropic noise follows this curve; no periodic sine stripes/zigzags.
   const bend=1.69*Math.exp(-Math.pow(Math.abs(xx)/1.68,3)),v=tilted+bend;
   const warp=(noise(xx*1.1+20,v*3,771)-.5)*.16;
   const streak=.48*noise(xx*.8+30,(v+warp)*83,813)+.32*noise(xx*2.4,(v+warp*.6)*147,891)+.2*noise(xx*5,v*230,401);
   const gas=fbm(xx*2+19,(v+warp)*17,3,72),outer=clamp((4.8-Math.abs(xx))/1.3)**1.3;
   const arch=Math.exp(-(((v+.03)/.48)**2))*outer*(.55+streak*.85);
   const diskRadius=Math.hypot(xx,(tilted-.45)/.29),diskMask=clamp((5-diskRadius)*.8);
   const flow=(noise(xx*.7+4,(tilted+warp)*70,691)*.55+noise(xx*2.7,(tilted+warp*.4)*140,191)*.45);
   const disk=diskMask*Math.exp(-Math.max(0,diskRadius-1)*.3)*(.52+.75*flow)*clamp((rad-.98)*12);
   const photon=Math.exp(-(((rad-1.018)/.022)**2))*.7;
   const hot=clamp((arch+disk*.88+photon)*(.85+gas*.3)),inner=Math.exp(-Math.max(0,Math.abs(xx)-1)*.63);
   const heat=clamp((arch*(.68+.48*clamp((v+.4)/.7))+disk*.9+photon)*inner*(1.05+.23*clamp(-xx/3)));
   red=105+150*Math.sqrt(heat);green=43+209*heat**.64;blue=12+238*heat**1.4;
   alpha=clamp(hot*1.2);if(rad<1.005)alpha=0;
  }else{
   if(r>1.45)continue;const rr=r*1.45,a=Math.atan2(y,x),grain=fbm(x*9+8,y*9,4,911);
   const warped=rr+.03*Math.sin(a*7)+.02*Math.sin(a*13+grain*2);
   const lip=Math.exp(-(((warped-1)/.09)**2)),depth=Math.exp(-Math.abs(warped-.6)*4)*clamp(rr*2);
   const filaments=Math.pow(.5+.5*Math.sin(a*19+Math.log(Math.max(.04,rr))*23+grain*9),5);
   const v=lip*(.32+grain*.65)+depth*filaments*.27;
   red=2+rr*13+v*135;green=5+rr*27+v*175;blue=12+rr*32+v*189;alpha=clamp(v*1.7+Math.exp(-rr*rr*4)*.98);
  }
  data[i]=red;data[i+1]=green;data[i+2]=blue;data[i+3]=alpha*255;
 }return data;
}
