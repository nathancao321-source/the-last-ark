import {afterEach,describe,expect,it,vi} from 'vitest';
import {createCamera,viewBounds} from '../src/camera/camera';
import {createGame} from '../src/game/game';
import {endlessLevel} from '../src/levels/endless';
import {createVisualState} from '../src/render/spacetime/model';
import {DEFAULT_WARP} from '../src/render/spacetime/config';
import type {Quality} from '../src/render/spacetime/config';
import {CINEMATIC_ART} from '../src/render/spacetime/art';
import {createEndlessBackground,drawEndlessBackground,endlessTilePlan,ENDLESS_TILE_LIMIT,resetEndlessBackground} from '../src/render/endless-background';
import {generateEndlessStars} from '../src/render/endless-field';

vi.mock('../src/render/endless-field',async original=>{
  const module=await original<typeof import('../src/render/endless-field')>();
  return {...module,generateEndlessStars:vi.fn(module.generateEndlessStars)};
});
interface Job {seed:number;key:string;tx:number;ty:number;span:number;res:number}
interface DrawOp {method:string;args:unknown[]}
function harness(){
  let canvases=0,commands=0;const ops:DrawOp[]=[],workers:FakeWorker[]=[];
  const context=(record=false)=>new Proxy({},{
    get:(_target,key)=>key==='createImageData'?(width:number,height:number)=>({data:new Uint8ClampedArray(width*height*4)}):
      key==='createRadialGradient'||key==='createLinearGradient'?()=>({addColorStop:()=>{}}):
      (...args:unknown[])=>{commands++;if(record)ops.push({method:String(key),args});},
    set:(_target,key,value)=>{commands++;if(record)ops.push({method:String(key),args:[value]});return true;},
  }) as CanvasRenderingContext2D;
  class FakeWorker {
    onmessage?: (event:{data:{key:string;pixels:Uint8ClampedArray;activity:Uint8ClampedArray;activity2:Uint8ClampedArray;ms:number}})=>void;
    onerror?:()=>void;job?:Job;terminated=false;submitted=0;
    constructor(){workers.push(this);}
    postMessage(job:Job){expect(this.job).toBeUndefined();this.job=job;this.submitted++;}
    terminate(){this.terminated=true;this.job=undefined;}
    complete(){const job=this.job;if(!job||this.terminated)return false;this.job=undefined;
      const length=(job.res+2)**2*4,pixels=new Uint8ClampedArray(length),activity=new Uint8ClampedArray(length),activity2=new Uint8ClampedArray(length);
      this.onmessage?.({data:{key:job.key,pixels,activity,activity2,ms:1}});return true;}
  }
  vi.stubGlobal('Worker',FakeWorker);
  vi.stubGlobal('document',{createElement:(tag:string)=>{expect(tag).toBe('canvas');canvases++;const ctx=context();return {width:0,height:0,getContext:()=>ctx};}});
  return {ctx:context(true),ops,workers,clear:()=>{ops.length=0;},counts:()=>({canvases,commands,workers:workers.length}),
    completeAll:()=>{let completed=0;while(workers.at(-1)?.complete()){completed++;if(completed>29)throw new Error('Worker queue exceeded bounded request plan');}return completed;}};
}
function fixture(){
  const game=createGame(endlessLevel),camera=createCamera({x:0,y:0},1280,720),state=createVisualState(game.players),cache=createEndlessBackground();
  const sample={dx:0,dy:0,luminance:0};
  const draw=(ctx:CanvasRenderingContext2D,quality:Quality='high')=>drawEndlessBackground(ctx,cache,game,camera,state,{...DEFAULT_WARP,quality},CINEMATIC_ART,sample);
  return {game,camera,state,cache,draw};
}
afterEach(()=>{vi.unstubAllGlobals();vi.mocked(generateEndlessStars).mockRestore();vi.restoreAllMocks();});

describe('bounded world-anchored Endless background rendering',()=>{
  it('bypasses all rendering, DOM, worker and cache work from a cold off state',()=>{
    const f=fixture(),before=structuredClone(f.cache),operations:unknown[]=[];
    vi.stubGlobal('document',{createElement:()=>{throw new Error('off requested canvas');}});
    vi.stubGlobal('Worker',class {constructor(){throw new Error('off requested worker');}});
    const ctx=new Proxy({},{get:(_t,key)=>{operations.push(key);throw new Error('off touched rendering context');},set:()=>{throw new Error('off changed rendering state');}}) as CanvasRenderingContext2D;
    f.draw(ctx,'off');expect(operations).toEqual([]);expect(f.cache).toEqual(before);
  });
  it('does not redraw, request or allocate residual high quality materials when off',()=>{
    const h=harness(),f=fixture();f.draw(h.ctx);expect(h.completeAll()).toBeGreaterThan(0);f.draw(h.ctx);
    expect(f.cache.stats.drawn).toBeGreaterThan(0);expect(f.cache.stats.bytes).toBeGreaterThan(0);
    const ready=[...f.cache.tiles.values()].filter(tile=>!!tile.texture);
    expect(ready.every(tile=>!!tile.activity&&!!tile.activity2)).toBe(true);
    expect(f.cache.stats.bytes).toBe(ready.reduce((bytes,tile)=>bytes+3*(tile.res+2)**2*4,0)+f.cache.sheet!.view.width*f.cache.sheet!.view.height*4);
    const counts=h.counts(),stats={...f.cache.stats},clock=f.cache.clock,entries=f.cache.tiles.size;h.clear();
    for(let i=0;i<5;i++){f.camera.position.x+=5000;f.draw(h.ctx,'off');}
    expect(h.ops).toEqual([]);expect(h.counts()).toEqual(counts);expect(f.cache.clock).toBeLessThanOrEqual(clock);
    expect(f.cache.tiles.size).toBeLessThanOrEqual(entries);expect(f.cache.stats.generated).toBeLessThanOrEqual(stats.generated);expect(f.cache.stats.bytes).toBeLessThanOrEqual(stats.bytes);
  });
  it('does not finish building queued high quality textures after switching off',()=>{
    const h=harness(),f=fixture();f.draw(h.ctx);expect(f.cache.busy).toBeDefined();
    expect(f.cache.pending.length).toBeGreaterThan(0);f.draw(h.ctx,'off');
    const counts=h.counts(),generated=f.cache.stats.generated;h.clear();h.completeAll();
    expect(h.ops).toEqual([]);expect(h.counts().canvases).toBe(counts.canvases);expect(f.cache.stats.generated).toBe(generated);
    f.draw(h.ctx);expect(h.completeAll()).toBeGreaterThan(0);f.draw(h.ctx);expect(f.cache.stats.drawn).toBeGreaterThan(0);
  });
  it('keeps tile planning bounded and covers the viewport across zooms and huge origins',()=>{
    for(const zoom of [2,.8,.2,.05,.001,1e-9,Number.EPSILON])for(const origin of [{x:0,y:0},{x:2**46,y:-(2**46)}]){
      const camera={position:{x:-9100,y:1234},width:3840,height:2160,zoom},before=structuredClone({camera,origin}),plan=endlessTilePlan(camera,origin);
      expect(plan.length).toBeGreaterThan(0);expect(plan.length).toBeLessThanOrEqual(16);expect(new Set(plan.map(p=>p.tx+','+p.ty)).size).toBe(plan.length);
      const b=viewBounds(camera),span=plan[0].span;expect(Number.isFinite(span)).toBe(true);expect(span).toBeGreaterThanOrEqual(2048);
      expect(plan.every(p=>p.span===span&&Number.isFinite(p.tx)&&Number.isFinite(p.ty))).toBe(true);
      for(const x of [b.minX,b.maxX])for(const y of [b.minY,b.maxY])expect(plan).toContainEqual({tx:Math.floor((x+origin.x)/span),ty:Math.floor((y+origin.y)/span),span});
      expect({camera,origin}).toEqual(before);
    }
  });
  it('preserves absolute tile identity when the local floating origin shifts',()=>{
    const camera=createCamera({x:9134,y:-8450},1280,720),origin={x:0,y:0},first=endlessTilePlan(camera,origin);
    camera.position.x-=8192;camera.position.y+=10240;origin.x+=8192;origin.y-=10240;
    expect(endlessTilePlan(camera,origin)).toEqual(first);
  });
  it('keeps GameState, camera and visual source state read-only in all quality tiers',()=>{
    const h=harness(),f=fixture();f.state.sources[0].weight=1;f.state.sources[0].active=true;
    const before=structuredClone({game:f.game,camera:f.camera,state:f.state});
    for(const quality of ['high','medium','low','off'] as const){f.draw(h.ctx,quality);h.completeAll();f.draw(h.ctx,quality);}
    expect({game:f.game,camera:f.camera,state:f.state}).toEqual(before);
  });
  it('reuses a warm view without resampling stars or submitting more worker jobs',()=>{
    const h=harness(),f=fixture();f.draw(h.ctx);h.completeAll();f.draw(h.ctx);
    const sampled=vi.mocked(generateEndlessStars).mock.calls.length,submitted=h.workers[0].submitted,generated=f.cache.stats.generated;
    for(let i=0;i<10;i++){f.state.time+=1/60;f.draw(h.ctx);}
    expect(vi.mocked(generateEndlessStars).mock.calls.length).toBe(sampled);expect(h.workers[0].submitted).toBe(submitted);expect(f.cache.stats.generated).toBe(generated);
  });
  it('retains every visible ready tile while a zoom boundary loads the next LOD',()=>{
    const h=harness(),f=fixture();f.camera.width=1200;f.camera.height=1200;f.camera.position={x:3000,y:3000};f.camera.zoom=.196;
    const oldPlan=endlessTilePlan(f.camera,{x:0,y:0});expect(oldPlan[0].span).toBe(2048);
    f.draw(h.ctx);h.completeAll();f.draw(h.ctx);
    const oldVisible=oldPlan.map(p=>[f.game.universe!.seed,p.span,p.tx,p.ty,192].join(':'));
    expect(oldVisible).toHaveLength(16);for(const key of oldVisible)expect(f.cache.tiles.get(key)?.texture).toBeDefined();
    f.camera.zoom=.195;expect(endlessTilePlan(f.camera,{x:0,y:0})[0].span).toBe(4096);
    const bounds=viewBounds(f.camera),generated=f.cache.stats.generated;
    // No worker completion: the previous world tiles must cover the whole frame
    // until new LOD surfaces exist, across repeated animation frames as well.
    for(let frame=0;frame<3;frame++){
      f.draw(h.ctx);expect(f.cache.stats.generated).toBe(generated);expect(f.cache.tiles.size).toBeLessThanOrEqual(32);
      for(const key of oldVisible)expect(f.cache.tiles.get(key)?.texture,`missing visible fallback ${key}`).toBeDefined();
      const ready=[...f.cache.tiles.values()].filter(t=>!!t.texture);
      for(let iy=0;iy<=8;iy++)for(let ix=0;ix<=8;ix++){
        const x=bounds.minX+(bounds.maxX-bounds.minX)*ix/8,y=bounds.minY+(bounds.maxY-bounds.minY)*iy/8;
        expect(ready.some(t=>x>=t.tx*t.span&&x<=(t.tx+1)*t.span&&y>=t.ty*t.span&&y<=(t.ty+1)*t.span)).toBe(true);
      }
      expect(f.cache.stats.drawn).toBeGreaterThanOrEqual(oldVisible.length);
    }
  });
  it('bounds cache and queued jobs across 1000 unrelated views and quality changes',()=>{
    // Noise sampling has independent deterministic tests; isolate cache load/unload
    // here with stable one-star tiles instead of spending this stress test on fBm.
    vi.mocked(generateEndlessStars).mockImplementation((_seed,tx,ty,span=2048)=>[{x:(tx+.5)*span,y:(ty+.5)*span,brightness:.5,size:1,galaxy:false}]);
    const h=harness(),f=fixture();let peakEntries=0,peakPending=0;
    for(let n=0;n<1000;n++){
      f.camera.position={x:n*16384-8192000,y:((n*37)%119)*24576};f.camera.zoom=[.8,.1,.004][n%3];
      f.draw(h.ctx,(['high','medium','low'] as const)[n%3]);
      if(n%17===0)h.workers.at(-1)!.complete();
      peakEntries=Math.max(peakEntries,f.cache.tiles.size);peakPending=Math.max(peakPending,f.cache.pending.length+Number(!!f.cache.busy));
      expect(f.cache.tiles.size).toBeLessThanOrEqual(ENDLESS_TILE_LIMIT);expect(f.cache.pending.length).toBeLessThanOrEqual(28);
      expect(f.cache.pending.length+Number(!!f.cache.busy)).toBeLessThanOrEqual(29);
      expect(f.cache.stats.bytes).toBeLessThanOrEqual(32*3*194*194*4+1600*1000*4);h.clear();
    }
    expect(peakEntries).toBe(32);expect(peakPending).toBeGreaterThan(0);expect(h.workers).toHaveLength(1);
    expect(h.completeAll()).toBeLessThanOrEqual(29);f.draw(h.ctx);expect(f.cache.stats.drawn).toBeGreaterThan(0);
  });
  it('keeps star transitions free of old canvas references and releases them after fading',()=>{
    let now=1000;vi.spyOn(performance,'now').mockImplementation(()=>now);
    const h=harness(),f=fixture();f.camera.width=1200;f.camera.height=1200;f.camera.position={x:3000,y:3000};f.camera.zoom=.196;
    f.draw(h.ctx);h.completeAll();now+=400;f.draw(h.ctx);
    const oldVisible=f.cache.lastTiles!.slice();expect(oldVisible.every(tile=>!!tile.texture&&!!tile.activity&&!!tile.activity2)).toBe(true);
    f.camera.zoom=.195;f.draw(h.ctx);
    const transition=f.cache.starTransition!;expect(transition).toBeDefined();expect(transition.tiles).toHaveLength(oldVisible.length);
    for(let i=0;i<transition.tiles.length;i++){const tile=transition.tiles[i];
      expect(tile).not.toBe(oldVisible[i]);expect(tile.stars).toBe(oldVisible[i].stars);
      expect(tile.texture).toBeUndefined();expect(tile.activity).toBeUndefined();expect(tile.activity2).toBeUndefined();
    }
    h.completeAll();now+=351;f.draw(h.ctx);expect(f.cache.starTransition).toBeUndefined();
    expect(f.cache.lastTiles!.every(tile=>f.cache.tiles.get(tile.key)===tile)).toBe(true);
    // Subsequent eviction cannot retain a detached old tile through the visual
    // transition or the previous-view list, outside the bounded cache budget.
    for(let i=1;i<=4;i++){now+=400;f.camera.position={x:i*60000,y:i*60000};f.draw(h.ctx);}
    expect(oldVisible.every(tile=>!f.cache.tiles.has(tile.key))).toBe(true);expect(f.cache.starTransition).toBeUndefined();
    expect(f.cache.lastTiles!.every(tile=>f.cache.tiles.get(tile.key)===tile)).toBe(true);expect(f.cache.tiles.size).toBeLessThanOrEqual(32);
  });
  it('drops stale evicted worker results and resets all cache ownership on seed change',()=>{
    const h=harness(),f=fixture();f.draw(h.ctx);const staleKey=f.cache.busy!;
    for(let n=1;n<5;n++){f.camera.position={x:n*50000,y:n*50000};f.draw(h.ctx);}
    expect(f.cache.tiles.has(staleKey)).toBe(false);const generated=f.cache.stats.generated,canvases=h.counts().canvases;
    h.workers[0].complete();expect(f.cache.stats.generated).toBe(generated);expect(h.counts().canvases).toBe(canvases);
    const oldWorker=h.workers[0];f.game.universe!.seed++;f.draw(h.ctx);expect(oldWorker.terminated).toBe(true);expect(h.workers).toHaveLength(2);
    expect([...f.cache.tiles.keys()].every(key=>key.startsWith(f.game.universe!.seed+':'))).toBe(true);
    resetEndlessBackground(f.cache);expect(h.workers[1].terminated).toBe(true);expect(f.cache).toEqual(createEndlessBackground());
  });
});
