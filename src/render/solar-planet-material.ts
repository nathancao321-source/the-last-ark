import {fbm, noise, hash} from './spacetime/noise';

export const SOLAR_PLANETS=['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune','pluto'] as const;
export type SolarPlanet=typeof SOLAR_PLANETS[number];
export type PlanetSize=48|128|256;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
export function isSolarPlanet(id:string):id is SolarPlanet{return (SOLAR_PLANETS as readonly string[]).includes(id);}
export function solarPlanetLOD(screenRadius:number,quality:string):PlanetSize {
  return quality==='low'||screenRadius<18?48:quality==='high'&&screenRadius>=42?256:128;
}
/** Only a lighting normal; all terrain samples and hand-drawn shapes are in the
 * local 2D disc. No UV map, external image, spherical projection or live shader. */
export function solarPlanetLight(x:number,y:number):number {
  return .16+.84*Math.max(0,-.43*x-.54*y+.72*Math.sqrt(Math.max(0,1-x*x-y*y)));
}
type Color=readonly [number,number,number];
type Polygon=readonly (readonly [number,number])[];
// Original, deliberately simplified Atlantic-facing silhouette, not a GIS map.
const LAND:readonly Polygon[]=[
  [[-.95,-.37],[-.79,-.63],[-.54,-.76],[-.4,-.68],[-.46,-.51],[-.29,-.41],[-.37,-.25],[-.5,-.18],[-.49,-.04],[-.38,.1],[-.46,.15],[-.61,-.04],[-.73,-.07],[-.83,-.21]],
  [[-.41,.11],[-.2,.17],[-.11,.31],[-.24,.52],[-.3,.72],[-.44,.91],[-.5,.79],[-.48,.53],[-.61,.32],[-.56,.19]],
  [[-.27,-.78],[-.12,-.89],[.03,-.85],[-.02,-.65],[-.15,-.51],[-.24,-.58]],
  [[.13,-.48],[.23,-.65],[.42,-.79],[.69,-.81],[.89,-.62],[.98,-.34],[.91,-.19],[.69,-.24],[.62,-.11],[.51,-.19],[.42,-.36],[.31,-.35],[.21,-.42]],
  [[.22,-.32],[.44,-.3],[.54,-.18],[.68,-.06],[.56,.07],[.49,.32],[.33,.55],[.21,.49],[.18,.27],[.04,.07],[.04,-.13],[.13,-.27]],
  [[.57,.33],[.61,.4],[.56,.56],[.51,.54]],
];
function inside(x:number,y:number,poly:Polygon):boolean {
  let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const [xi,yi]=poly[i],[xj,yj]=poly[j];
    if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)hit=!hit;
  }return hit;
}
function blend(a:Color,b:Color,t:number):Color{return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}
function gaussian(x:number,y:number,cx:number,cy:number,rx:number,ry:number):number {
  return Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2)*2);
}

export interface PlanetPixels {surface:Uint8ClampedArray;weather?:Uint8ClampedArray}
/** Precomputed deterministic 2D paint. Detail frequencies are shared across LOD
 * so continents, storms and basins never change position at a zoom threshold. */
export function solarPlanetPixels(id:SolarPlanet,size:PlanetSize):PlanetPixels {
  const surface=new Uint8ClampedArray(size*size*4);
  const weather=['earth','venus','jupiter','neptune'].includes(id)?new Uint8ClampedArray(size*size*4):undefined;
  const craters=Array.from({length:23},(_,i)=>({x:(hash(i,5,41)-.5)*1.75,y:(hash(i,17,53)-.5)*1.75,r:.025+hash(i,23,97)**2*.13}));
  for(let py=0;py<size;py++)for(let px=0;px<size;px++){
    const x=(px+.5)*2/size-1,y=(py+.5)*2/size-1,r=Math.hypot(x,y);if(r>=1)continue;
    const i=(py*size+px)*4,n=fbm(x*4+19,y*4+9,3,541),m=fbm(x*11+7,y*11-4,3,617);
    const fine=size>48?noise(x*44+1,y*44-9,733):.5;
    const light=solarPlanetLight(x,y),edge=clamp((1-r)*size*.6);
    let color:Color,cloud=0,cloudColor:Color=[230,239,241];
    if(id==='earth'){
      const land=LAND.some(p=>inside(x+(m-.5)*.026,y+(n-.5)*.026,p));
      const ocean=fbm(x*8+12,y*8+21,3,191);
      color=land?blend([74,103,76],[148,145,101],clamp(n*.85+(y<0?.14:0))):blend([15,53,94],[32,113,153],ocean);
      // Sahara is a subdued broad region, not a green fill for all land.
      if(land&&x>.02&&y>-.28&&y<.02)color=blend(color,[171,149,105],.68);
      const curl=fbm(x*8+m*.7,y*14-n*.8,4,881);
      cloud=clamp((curl-.49)*4.8)*.82;
      cloud*=.45+.55*clamp(Math.abs(y)*2+.25);
      if(y<-.84||y>.92)color=blend(color,[199,220,222],clamp((Math.abs(y)-.84)*6));
    }else if(id==='mars'){
      const basin=fbm(x*3+8,y*4+14,3,702),dark=clamp((.52-basin)*4);
      color=blend([174+n*49,87+n*42,57+n*32],[78,65,54],dark*.68);
      color=color.map(c=>c*(.92+(m-.5)*.18+(fine-.5)*.04)) as unknown as Color;
      if(y<-.83+(m-.5)*.04)color=blend(color,[216,208,190],clamp((-.8-y)*8)*.9);
      const canyon=Math.exp(-(((y-.06-Math.sin(x*5)*.025)/.015)**2))*gaussian(x,y,-.23,.04,.4,.2);
      color=blend(color,[100,55,39],canyon*.35);
    }else if(id==='jupiter'||id==='saturn'){
      const bend=y+.095*x*x,warp=(n-.5)*.067+(m-.5)*.022;
      const belt=Math.sin((bend+warp)*(id==='jupiter'?20:17));
      const threads=Math.sin(bend*99+m*5+x*2)*.045+(fine-.5)*.025;
      const tone=clamp(.54+belt*(id==='jupiter'?.27:.09)+threads);
      color=id==='jupiter'?blend([139,97,73],[229,214,180],tone):blend([178,151,107],[231,211,165],tone);
      if(id==='jupiter'){
        const sx=(x-.33)/.23,sy=(y-.23)/.105,d=Math.hypot(sx,sy);
        const storm=clamp((1-d+(m-.5)*.08)*5),swirl=.5+.5*Math.sin(d*23+Math.atan2(sy,sx)*2+m*5);
        color=blend(color,blend([171,99,72],[193,127,91],swirl*.35+n*.22),storm*.85);
        cloud=(Math.sin(bend*92+m*6+x*4)*.5+.5)*.055;
        cloudColor=[242,225,193];
      }
    }else if(id==='mercury'){
      let value=.68+(n-.5)*.33+(m-.5)*.2+(fine-.5)*.075;
      // Caloris-like broad basin and compact craters; no lunar maria silhouette.
      value+=gaussian(x,y,-.28,.21,.42,.37)*.09;
      for(const c of craters){const d=Math.hypot(x-c.x,y-c.y)/c.r;
        if(d<1.4){value-=Math.exp(-d*d*3)*.2;value+=Math.exp(-(((d-.91)*12)**2))*(.11-.045*(x-c.x+y-c.y)/c.r);}
      }
      const rx=x+.32,ry=y+.26,dist=Math.hypot(rx,ry),a=Math.atan2(ry,rx);
      value+=Math.max(0,Math.cos(a*11+Math.sin(a*4)))**18*Math.exp(-dist*8)*.13;
      color=[160*value,158*value,151*value];
    }else if(id==='venus'){
      const flow=fbm(x*3+20,y*8+(n-.5)*1.7+x*x*.8,4,309);
      color=blend([188,161,120],[244,230,197],.48+flow*.45);
      cloud=clamp((flow-.35)*1.2)*.22;cloudColor=[253,241,216];
    }else if(id==='uranus'||id==='neptune'){
      const band=Math.sin((y+.05*x*x)*19+(n-.5)*.8);
      color=id==='uranus'?blend([101,172,181],[156,207,208],.42+band*.07+(n-.5)*.12):blend([38,78,139],[74,128,182],.43+band*.13+(m-.5)*.16);
      if(id==='neptune'){
        const storm=gaussian(x,y,-.29,.18,.23,.11);
        color=blend(color,[26,56,106],storm*.58);
        cloud=gaussian(x,y,-.22,.05,.28,.025)*.22+gaussian(x,y,.31,-.32,.24,.018)*.21;
      }
    }else{
      const lobes=Math.max(gaussian(x,y,-.11,-.04,.39,.33),gaussian(x,y,.25,-.05,.42,.31));
      const tail=gaussian(x,y,.12,.23,.25,.37),ice=clamp((Math.max(lobes,tail)-.23+(m-.5)*.12)*3);
      color=blend(blend([99,82,73],[166,146,126],n),[213,205,186],ice*.92);
      color=color.map(c=>c*(.94+(m-.5)*.12+(fine-.5)*.04)) as unknown as Color;
    }
    const atmospheric=id==='earth'?1:id==='venus'?.32:id==='uranus'||id==='neptune'?.4:0;
    // Emissive atmospheric limb is entirely inside the physical silhouette.
    const rim=atmospheric*Math.exp(-(((r-.974)/.019)**2))*(.18+.82*light)*.42;
    for(let channel=0;channel<3;channel++)surface[i+channel]=color[channel]*light+[72,146,212][channel]*rim;
    surface[i+3]=edge*255;
    if(weather){for(let channel=0;channel<3;channel++)weather[i+channel]=cloudColor[channel]*light;
      weather[i+3]=255*cloud*clamp((.96-r)*12);}
  }
  return {surface,weather};
}

/** Bounded analytic drift, using simulation time so pause freezes all clouds. */
export function solarPlanetWeather(id:SolarPlanet,time:number){
  const t=Math.max(0,time),speed=id==='venus'?.018:.035;
  return {x:Math.sin(t*speed)*.014,y:Math.sin(t*speed*.7)*.006,alpha:.94+.025*Math.sin(t*.09)};
}
