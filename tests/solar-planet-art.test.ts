import {afterEach,describe,expect,it,vi} from 'vitest';
import {createBody} from '../src/game/entities';
import {createCamera} from '../src/camera/camera';
import {SOLAR_PLANETS,solarPlanetPixels,solarPlanetLight,solarPlanetLOD,solarPlanetWeather} from '../src/render/solar-planet-material';
import {drawSolarPlanet,clearSolarPlanetCache,solarPlanetCacheStats,solarPlanetExtent} from '../src/render/solar-planets';

interface Op {name:string;args:unknown[]}
function context(ops:Op[]=[]):CanvasRenderingContext2D{return new Proxy({},{
  get:(_t,key)=>(...args:unknown[])=>ops.push({name:String(key),args}),
  set:(_t,key,value)=>{ops.push({name:String(key),args:[value]});return true;},
}) as CanvasRenderingContext2D;}
function installCanvas(){vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>({
  createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:()=>{},
})})});}
const body=(id='earth')=>createBody({id,kind:'planet',radius:40,position:{x:1000,y:-700},appearance:{name:id,color:'#789abc',ring:id==='saturn'}});
afterEach(()=>{clearSolarPlanetCache();vi.unstubAllGlobals();});

describe('solar planet material and rendering contracts',()=>{
  it.each(SOLAR_PLANETS)('%s is deterministic, varied and strictly contained in its physical disc',id=>{
    const a=solarPlanetPixels(id,48);expect(a).toEqual(solarPlanetPixels(id,48));
    const colors=new Set<string>();
    for(let y=0;y<48;y++)for(let x=0;x<48;x++){
      const i=(y*48+x)*4,r=Math.hypot((x+.5)/24-1,(y+.5)/24-1);
      if(r>=1){expect(a.surface[i+3]).toBe(0);if(a.weather)expect(a.weather[i+3]).toBe(0);}
      if(a.surface[i+3]===255)colors.add(a.surface.slice(i,i+3).join(','));
    }
    expect(colors.size).toBeGreaterThan(150);
  });
  it('retains the upper-left light for every material and camera-independent LOD',()=>{
    expect(solarPlanetLight(-.4,-.5)).toBeGreaterThan(solarPlanetLight(.4,.5));
    expect([solarPlanetLOD(10,'high'),solarPlanetLOD(30,'high'),solarPlanetLOD(80,'high')]).toEqual([48,128,256]);
    expect(solarPlanetLOD(120,'low')).toBe(48);expect(solarPlanetLOD(120,'medium')).toBe(128);
  });
  it('makes continuous bounded weather from simulation time, with no wall-clock animation',()=>{
    for(const id of SOLAR_PLANETS)for(let t=0;t<180;t+=.6){
      const a=solarPlanetWeather(id,t),b=solarPlanetWeather(id,t+1/60);
      expect(a).toEqual(solarPlanetWeather(id,t));expect(Math.abs(a.x)).toBeLessThanOrEqual(.014);
      expect(Math.abs(a.y)).toBeLessThanOrEqual(.006);expect(Math.abs(b.x-a.x)).toBeLessThan(.00001);
      expect(Math.abs(b.alpha-a.alpha)).toBeLessThan(.00004);
    }
  });
  it('does not allocate or draw when OFF, hidden, pending, distant or effectively subpixel',()=>{
    installCanvas();const b=body(),c=createCamera(b.position),ops:Op[]=[];
    drawSolarPlanet(context(ops),b,3,c,'off');
    drawSolarPlanet(context(ops),{...b,layer:'hidden'},3,c,'high');
    drawSolarPlanet(context(ops),{...b,spawnPending:true},3,c,'high');
    drawSolarPlanet(context(ops),b,3,{...c,position:{x:1e8,y:1e8}},'high');
    expect(ops).toEqual([]);expect(solarPlanetCacheStats().entries).toBe(0);
    drawSolarPlanet(context(),b,3,{...c,zoom:.001},'high');expect(solarPlanetCacheStats().entries).toBe(0);
    drawSolarPlanet(context(),b,3,c,'low');const warm=solarPlanetCacheStats();
    drawSolarPlanet(context(ops),b,3,c,'off');expect(ops).toEqual([]);expect(solarPlanetCacheStats()).toEqual(warm);
  });
  it('reuses materials across positions, radii, times and retries without modifying the inputs',()=>{
    installCanvas();const b=body(),c=createCamera(b.position),snapshot=structuredClone({b,c});
    for(let i=0;i<70;i++)drawSolarPlanet(context(),{...b,position:{x:b.position.x+i,y:b.position.y},radius:20+i/3},i,c,'low');
    expect(solarPlanetCacheStats().builds).toBe(1);expect(solarPlanetCacheStats().entries).toBe(1);
    expect({b,c}).toEqual(snapshot);
    for(const id of SOLAR_PLANETS)drawSolarPlanet(context(),body(id),0,c,'low');
    expect(solarPlanetCacheStats().entries).toBe(9);
    expect(drawSolarPlanet(context(),body('tutorial-planet'),0,c,'high')).toBe(false);
  });
  it('draws rear rings, origin-centred surface, then front rings and identifies noncolliding rings',()=>{
    installCanvas();const b=body('saturn'),c=createCamera(b.position),snapshot=structuredClone({b,c}),ops:Op[]=[];
    drawSolarPlanet(context(ops),b,18,c,'high');
    expect(ops.filter(op=>op.name==='translate')).toEqual([{name:'translate',args:[1000,-700]}]);
    const disc=ops.findIndex(op=>op.name==='drawImage');expect(disc).toBeGreaterThan(0);
    const back=ops.slice(0,disc).filter(op=>op.name==='ellipse'),front=ops.slice(disc).filter(op=>op.name==='ellipse');
    expect(back.length).toBeGreaterThan(10);expect(front.length).toBeGreaterThan(10);
    expect(back.every(op=>op.args[5]===Math.PI&&op.args[6]===Math.PI*2)).toBe(true);
    expect(front.every(op=>op.args[5]===0&&op.args[6]===Math.PI)).toBe(true);
    expect(ops.some(op=>op.name==='fillText'&&op.args[0]==='装饰星环 · 无碰撞')).toBe(true);
    expect(solarPlanetExtent(b)).toBe(40*1.96);expect({b,c}).toEqual(snapshot);
  });
  it('bounds worker requests and recovers to the small material if a worker fails',()=>{
    installCanvas();const requests:unknown[]=[];
    class FakeWorker {static latest:FakeWorker;onmessage:unknown;onerror?:()=>void;constructor(){FakeWorker.latest=this;}postMessage(data:unknown){requests.push(data);}terminate(){}}
    vi.stubGlobal('Worker',FakeWorker);const b=body(),c=createCamera(b.position);c.zoom=2;
    for(let i=0;i<80;i++)drawSolarPlanet(context(),b,i,c,'high');
    expect(requests).toEqual([{id:'earth',size:256}]);expect(solarPlanetCacheStats().pending).toBe(1);
    FakeWorker.latest.onerror!();drawSolarPlanet(context(),b,90,c,'high');
    expect(solarPlanetCacheStats().pending).toBe(0);expect(solarPlanetCacheStats().entries).toBe(1);expect(requests).toHaveLength(1);
  });
});
