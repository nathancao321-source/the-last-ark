import {afterEach,describe,expect,it,vi} from 'vitest';
import {createBody} from '../src/game/entities';
import {createCamera} from '../src/camera/camera';
import {clearEndlessPlanetCache,describeEndlessPlanet,drawEndlessPlanet,endlessPlanetCacheStats,endlessPlanetLight,endlessPlanetPixels,endlessPlanetWeather} from '../src/render/endless-planets';

function planet(id='sector/planet0',radius=36){return createBody({id,kind:'planet',position:{x:100,y:-40},radius,appearance:{name:'游星',color:'#8fa9db'}});}
interface Op {name:string;args:unknown[]}
function context(ops:Op[]=[]):CanvasRenderingContext2D {return new Proxy({},{
  get:(_t,key)=>key==='createRadialGradient'?()=>({addColorStop:()=>{}}):(...args:unknown[])=>{ops.push({name:String(key),args});},
  set:(_t,key,value)=>{ops.push({name:String(key),args:[value]});return true;},
}) as CanvasRenderingContext2D;}
function installCanvasMock(){
  vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>({
    createImageData:(width:number,height:number)=>({data:new Uint8ClampedArray(width*height*4)}),putImageData:()=>{},
  })})});
}
afterEach(()=>{vi.unstubAllGlobals();clearEndlessPlanetCache();});
describe('read-only Endless planet material',()=>{
  it('derives stable visual diversity without adding physics kinds or mutating the body',()=>{
    const types=new Set<string>(),before=[];let rings=0;
    for(let i=0;i<160;i++){const body=planet('sector'+i+'/planet0',18+i%23),snapshot=structuredClone(body),a=describeEndlessPlanet(body);
      body.position={x:12345,y:-9876};body.velocity={x:40,y:-10};
      expect(describeEndlessPlanet(body)).toEqual(a);expect(snapshot.kind).toBe('planet');
      types.add(a.material);if(a.rings){rings++;expect(a.material).toBe('gas');expect(body.radius).toBeGreaterThanOrEqual(32);expect(a.ringLabel).toContain('无碰撞');}
      before.push(snapshot);
    }
    expect(types).toEqual(new Set(['rocky','gas','ice']));expect(rings).toBeGreaterThan(0);expect(rings).toBeLessThan(32);expect(before).toHaveLength(160);
  });
  it('keeps all small planets rocky and unringed',()=>{
    for(let i=0;i<40;i++){const d=describeEndlessPlanet(planet('small'+i,18+i%7));expect(d.material).toBe('rocky');expect(d.rings).toBe(false);}
  });
  it('bakes deterministic sphere surfaces with detail and transparent exterior',()=>{
    for(const material of ['rocky','gas','ice'] as const){const desc={...describeEndlessPlanet(planet()),material},a=endlessPlanetPixels(desc,48);
      expect(a).toEqual(endlessPlanetPixels(desc,48));expect(a[3]).toBe(0);expect(a[(24*48+24)*4+3]).toBe(255);
      const colors=new Set<string>();for(let i=0;i<a.length;i+=4)if(a[i+3]>250)colors.add(a.slice(i,i+3).join(','));expect(colors.size).toBeGreaterThan(150);
      const upper=(12*48+12)*4,lower=(35*48+35)*4;expect(a[upper]+a[upper+1]+a[upper+2]).toBeGreaterThan(a[lower]+a[lower+1]+a[lower+2]);
    }
  });
  it('preserves the fixed upper-left light independently of material or time',()=>{
    expect(endlessPlanetLight(-.4,-.5)).toBeGreaterThan(endlessPlanetLight(.4,.5));
    for(const x of [-.9,0,.9])for(const y of [-.9,0,.9]){expect(endlessPlanetLight(x,y)).toBeGreaterThanOrEqual(.15);expect(endlessPlanetLight(x,y)).toBeLessThanOrEqual(1.01);}
  });
  it('evaluates smooth weather from absolute elapsed time and freezes at a repeated time',()=>{
    const d=describeEndlessPlanet(planet());expect(endlessPlanetWeather(d,14)).toEqual(endlessPlanetWeather(d,14));
    expect(endlessPlanetWeather(d,14)).not.toEqual(endlessPlanetWeather(d,20));
    for(let t=0;t<120;t+=.25){const a=endlessPlanetWeather(d,t),b=endlessPlanetWeather(d,t+1/60);
      expect(Math.abs(a.x-b.x)).toBeLessThan(.001);expect(Math.abs(a.activity-b.activity)).toBeLessThan(.001);expect(a.visibility).toBeGreaterThanOrEqual(0);expect(a.visibility).toBeLessThanOrEqual(1);}
  });
  it('draws zero operations and allocates no cache for off even after caches are warm',()=>{
    installCanvasMock();const body=planet(),camera=createCamera(body.position),ops:Op[]=[];
    drawEndlessPlanet(context(ops),body,12,camera,'off');expect(ops).toEqual([]);expect(endlessPlanetCacheStats().entries).toBe(0);
    drawEndlessPlanet(context(),body,12,camera,'high');const warm=endlessPlanetCacheStats();
    drawEndlessPlanet(context(ops),body,13,camera,'off');expect(ops).toEqual([]);expect(endlessPlanetCacheStats()).toEqual(warm);
  });
  it('does not build textures for offscreen or subpixel planets',()=>{
    installCanvasMock();const body=planet(),camera=createCamera(body.position),ops:Op[]=[];camera.zoom=.05;
    drawEndlessPlanet(context(ops),body,0,camera,'high');expect(ops.some(op=>op.name==='arc')).toBe(true);expect(endlessPlanetCacheStats().entries).toBe(0);
    camera.position={x:100000,y:100000};ops.length=0;drawEndlessPlanet(context(ops),body,0,camera,'high');expect(ops).toEqual([]);
  });
  it('keeps only eighteen reusable texture entries across continued exploration',()=>{
    installCanvasMock();const camera=createCamera({x:100,y:-40}),ctx=context();camera.zoom=1;
    for(let i=0;i<45;i++)drawEndlessPlanet(ctx,planet('cache'+i),0,camera,'high');
    const full=endlessPlanetCacheStats();expect(full.entries).toBe(full.capacity);expect(full.entries).toBe(18);expect(full.bytes).toBeLessThanOrEqual(18*160*160*4);
    drawEndlessPlanet(ctx,planet('cache44'),2,camera,'high');expect(endlessPlanetCacheStats().builds).toBe(full.builds);expect(endlessPlanetCacheStats().hits).toBe(full.hits+1);
    drawEndlessPlanet(ctx,planet('cache0'),2,camera,'high');expect(endlessPlanetCacheStats().builds).toBe(full.builds+1);
  });
  it('anchors to the real body once and draws ring back, sphere, then ring front',()=>{
    installCanvasMock();let body=planet();for(let i=0;i<1000&&!describeEndlessPlanet(body).rings;i++)body=planet('ring'+i,38);
    expect(describeEndlessPlanet(body).rings).toBe(true);const camera=createCamera(body.position),snapshot=structuredClone({body,camera}),ops:Op[]=[];camera.zoom=1;snapshot.camera.zoom=1;
    drawEndlessPlanet(context(ops),body,12,camera,'high');
    expect(ops.filter(op=>op.name==='translate')).toEqual([{name:'translate',args:[100,-40]}]);
    const disk=ops.findIndex(op=>op.name==='drawImage'),ellipses=ops.map((op,index)=>({op,index})).filter(v=>v.op.name==='ellipse');
    const backs=ellipses.filter(v=>v.index<disk),fronts=ellipses.filter(v=>v.index>disk&&v.op.args[6]===Math.PI);
    expect(backs).toHaveLength(6);expect(backs.every(v=>v.op.args[5]===Math.PI&&v.op.args[6]===2*Math.PI)).toBe(true);expect(fronts).toHaveLength(6);
    expect(ops.some(op=>op.name==='fillText'&&op.args[0]==='装饰星环 · 无碰撞')).toBe(true);expect({body,camera}).toEqual(snapshot);
  });
  it('works without DOM allocation in node and respects low LOD',()=>{
    const body=planet(),camera=createCamera(body.position),ops:Op[]=[];drawEndlessPlanet(context(ops),body,0,camera,'low');
    expect(ops.some(op=>op.name==='fill')).toBe(true);expect(ops.some(op=>op.name==='fillText')).toBe(false);expect(endlessPlanetCacheStats().entries).toBe(0);
  });
});
