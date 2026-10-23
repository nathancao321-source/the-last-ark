import { GENERATOR_VERSION, landmarkPosition, type GeneratorVersion } from '../world/generator';
import { seededRandom } from '../world/sectors';
import {sampleRegionWeights} from '../world/regions';

export interface EndlessFieldSample {density:number;tint:number;filament:number;cloud:number;dust:number}
export interface EndlessStar {x:number;y:number;brightness:number;size:number;galaxy:boolean}
/** 16x16 fixed world subcells, four potential sites each. Arbitrary non-aligned
 * spans touch at most 17x17 subcells; aligned renderer LODs use exactly 1024. */
export const ENDLESS_STAR_TILE_LIMIT=17*17*4;
const UINT32=4294967296;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const fade=(t:number)=>t*t*t*(t*(t*6-15)+10);

/** Mix both halves of each integer lattice coordinate. A bitwise-only hash
 * would repeat after 2^32 cells, well inside the universe's supported range. */
function hash(x:number,y:number,seed:number):number {
 const xh=Math.floor(x/UINT32),yh=Math.floor(y/UINT32),xl=x-xh*UINT32,yl=y-yh*UINT32;
 let h=(seed^Math.imul(xl,374761393)^Math.imul(yl,668265263)^Math.imul(xh,1597334677)^Math.imul(yh,3812015801))>>>0;
 h=Math.imul(h^(h>>>16),2246822507);h=Math.imul(h^(h>>>13),3266489909);
 return ((h^(h>>>16))>>>0)/UINT32;
}
function noise(x:number,y:number,seed:number):number {
 const ix=Math.floor(x),iy=Math.floor(y),a=fade(x-ix),b=fade(y-iy);
 const p=hash(ix,iy,seed),q=hash(ix+1,iy,seed),r=hash(ix,iy+1,seed),s=hash(ix+1,iy+1,seed);
 return (p+(q-p)*a)*(1-b)+(r+(s-r)*a)*b;
}
function fbm(x:number,y:number,seed:number,octaves:number):number {
 let sum=0,weight=.5,total=0;
 // Integer frequency scaling retains the large-coordinate fractional phase;
 // no accumulated rotation or camera-dependent texture offset is involved.
 for(let n=0;n<octaves;n++){sum+=noise(x,y,seed+n*193)*weight;total+=weight;weight*=.5;x*=2;y*=2;}
 return sum/total;
}
function nebulaCenter(seed:number,version:GeneratorVersion):{x:number;y:number} {
 return landmarkPosition(seed,'nebula',version);
}
function sample(seed:number,x:number,y:number,center:{x:number;y:number},version:GeneratorVersion):EndlessFieldSample {
 const mx=x/15000,my=y/15000,macro=fbm(mx,my,seed+71,3);
 const wx=(fbm(x/3900,y/3900,seed+127,3)-.5)*1600,wy=(fbm(x/3900+7,y/3900-3,seed+811,3)-.5)*1600;
 const qx=(x+wx)/530,qy=(y+wy)/530,n=fbm(qx,qy,seed+917,5);
 // Interlocking contour ridges provide cosmic-web cells; the second family
 // branches at a smaller scale and knots break up uniform neon-like lines.
 const ridge=Math.exp(-Math.abs(n-.51)*62),branch=Math.exp(-Math.abs(fbm(qx*2.3+3,qy*2.3-5,seed+337,3)-.49)*54);
 const knots=.22+1.65*noise(qx*3.7,qy*3.7,seed+1291)**2;
 const cloud=fbm(qx*.59,qy*.59,seed+31,3),dust=smooth(.4,.77,noise(qx*1.7,qy*1.7,seed+771));
 const dx=(x-center.x+wx*.55)/6400,dy=(y-center.y+wy*.55)/3900;
 const landmark=Math.exp(-(dx*dx+dy*dy)*1.25);
 const regional=version===3?.55+.9*sampleRegionWeights(seed,{x:x/2048,y:y/2048}).density:1;
 const density=clamp((.025+.78*smooth(.53,.73,macro))*regional+.94*landmark);
 return {density,tint:noise(x/7400+13,y/7400-8,seed+501),
  filament:clamp((ridge*.69+branch*.31)*(.45+cloud)*density*knots),cloud:cloud*cloud*density,dust};
}

/** Absolute universe coordinates; independent of camera, elapsed time, loading
 * order and game bodies. Only light intensity animates in the renderer. */
export function sampleEndlessField(seed:number,x:number,y:number,version:GeneratorVersion=GENERATOR_VERSION):EndlessFieldSample {
 return sample(seed,x,y,nebulaCenter(seed,version),version);
}

/** Pixel centres include a one-texel gutter. The neighboring tile's inner edge
 * and this tile's gutter sample identical world positions, including negatives. */
export function generateEndlessTile(seed:number,tx:number,ty:number,span=2048,res=128,version:GeneratorVersion=GENERATOR_VERSION):{pixels:Uint8ClampedArray;activity:Uint8ClampedArray;activity2:Uint8ClampedArray} {
 const size=res+2,pixels=new Uint8ClampedArray(size*size*4),activity=new Uint8ClampedArray(size*size*4),activity2=new Uint8ClampedArray(size*size*4),step=span/res,center=nebulaCenter(seed,version);
 for(let py=0;py<size;py++)for(let px=0;px<size;px++) {
  const x=tx*span+(px-.5)*step,y=ty*span+(py-.5)*step,s=sample(seed,x,y,center,version);
  const lit=Math.max(0,s.filament*(1-s.dust*.82)),mist=s.cloud*(1-s.dust*.65),i=(py*size+px)*4;
  pixels[i]=2+lit*(31+s.tint*20)+mist*7;
  pixels[i+1]=3+lit*(42-s.tint*8)+mist*9;
  pixels[i+2]=7+lit*(87+s.tint*12)+mist*21;pixels[i+3]=255;
  // Spatially varying emissive amplitude: animation scales this fixed map,
  // so gas never slides with the camera and no per-frame noise is generated.
  activity[i]=74+s.tint*26;activity[i+1]=86-s.tint*14;activity[i+2]=156;
  activity[i+3]=Math.round(clamp(lit*.36+mist*.07)*255);
  // Complementary dust structure has a different fixed spatial phase from the
  // emissive filaments. The renderer breathes these two maps independently at
  // periods >=25s; no texture translation or frame-time noise is required.
  const shadows=s.density*(.10+s.dust*.70)*(.30+s.cloud*.70)*(1-s.filament*.55);
  const foldedDust=s.cloud*s.dust*(.2+.8*s.tint);
  activity2[i]=1;activity2[i+1]=3;activity2[i+2]=8;
  activity2[i+3]=Math.round(clamp(shadows+foldedDust*.45)*255);
 }
 return {pixels,activity,activity2};
}

/** Choose one descendant from each quadtree block. A coarser block chooses one
 * of its existing children, so zoom-out keeps a subset of the exact same sites
 * rather than reseeding stars across a larger canvas. Work stays logarithmic. */
function descendantCell(seed:number,x:number,y:number,stride:number):{x:number;y:number} {
 for(let size=stride;size>1;size/=2) {
  const child=Math.floor(hash(x,y,seed+Math.log2(size)*2711)*4),half=size/2;
  x+=(child%2)*half;y+=Math.floor(child/2)*half;
 }
 return {x,y};
}
/** Stars live on a permanent 128-unit lattice inside the fixed 2048 sectors.
 * Each LOD visits only 16x16 quadtree representatives, never all hidden sectors.
 * The three dim micro-sites cluster along the sampled web; deep space retains
 * sparse primary stars. Neither positions nor brightness depend on LOD/time. */
export function generateEndlessStars(seed:number,tx:number,ty:number,span=2048,version:GeneratorVersion=GENERATOR_VERSION):EndlessStar[] {
 const stars:EndlessStar[]=[],left=tx*span,top=ty*span,right=left+span,bottom=top+span;
 if(!(span>0)||![left,top,right,bottom].every(Number.isFinite))return stars;
 const center=nebulaCenter(seed,version),stride=2**Math.max(0,Math.ceil(Math.log2(span/2048))),spacing=stride*128;
 const minX=Math.floor(left/spacing),minY=Math.floor(top/spacing),maxX=Math.ceil(right/spacing),maxY=Math.ceil(bottom/spacing);
 for(let gy=minY;gy<maxY;gy++)for(let gx=minX;gx<maxX;gx++) {
  const cell=descendantCell(seed+8711,gx*stride,gy*stride,stride),baseX=cell.x*128,baseY=cell.y*128;
  const random=seededRandom(Math.floor(hash(cell.x,cell.y,seed+1987)*UINT32)),s=sample(seed,baseX+64,baseY+64,center,version);
  for(let site=0;site<4;site++) {
   const x=baseX+random()*128,y=baseY+random()*128,keep=random(),light=random(),scale=random(),rare=random();
   const micro=site>0,probability=micro?.004+s.density*.80+s.filament*.65:.14+s.density*.60+s.filament*.16;
   if(keep>=probability||x<left||x>=right||y<top||y>=bottom)continue;
   const galaxy=!micro&&rare<.006,size=micro?.35+scale*.4:.65+scale*.75;
   stars.push({x,y,brightness:micro?.10+light*.14:.24+Math.pow(light,2.1)*.76,size:galaxy?3+size*2:size,galaxy});
  }
 }
 return stars;
}
