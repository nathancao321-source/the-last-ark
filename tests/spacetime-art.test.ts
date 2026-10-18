import { describe,it,expect } from 'vitest';
import { DEFAULT_ART,setArt } from '../src/render/spacetime/art';
import { noise,nebulaDensity,worldFabric } from '../src/render/spacetime/noise';
import { generateNebula,generateStars } from '../src/render/spacetime/texture';
import { drawBackground,worldCells } from '../src/render/spacetime/background';
import { createCamera,worldToScreen } from '../src/camera/camera';
import { firstLevel } from '../src/levels/first';
import { createVisualState } from '../src/render/spacetime/model';
import { DEFAULT_WARP } from '../src/render/spacetime/config';
import { nodeFrame,NODE_FRAMES } from '../src/render/spacetime/node-texture';
import { drawNode,particlePoint } from '../src/render/spacetime/nodes';
import { updateVisuals } from '../src/render/spacetime/model';
import { sampleDisturbance } from '../src/render/spacetime/model';
import { visualAnchors } from '../src/render/spacetime/anchors';
describe('cinematic 2D background',()=>{
  it('is deterministic, bounded and continuous across integer noise coordinates',()=>{
    for(let x=-10;x<10;x++){expect(noise(x-1e-6,.5)).toBeCloseTo(noise(x+1e-6,.5),5);const d=nebulaDensity(x,.72);expect(Object.values(d).every(Number.isFinite)).toBe(true);}
    expect(generateNebula(DEFAULT_ART,48)).toEqual(generateNebula(DEFAULT_ART,48));
    expect(generateStars()).toEqual(generateStars());expect(generateStars().length).toBeLessThanOrEqual(55000);
  });
  it('dense and sparse are different density maps with real dark regions',()=>{
    const dense=generateNebula(DEFAULT_ART,64),sparse=generateNebula({...DEFAULT_ART,background:'sparse'},64);
    expect(dense).not.toEqual(sparse);const values=Array.from(dense).filter((_v,i)=>i%4!==3);
    expect(values.filter(v=>v<12).length/values.length).toBeGreaterThan(.5);expect(Math.max(...values)).toBeGreaterThan(40);
    expect(dense.filter((_v,i)=>i%4===3).every(v=>v===255)).toBe(true);
  });
  it('art controls clamp invalid values without changing unrelated controls',()=>{
    const a={...DEFAULT_ART};setArt(a,'exposure',99);setArt(a,'nebula',NaN);expect(a.exposure).toBe(1.6);expect(a.nebula).toBe(1);
  });
  it.each(['high','medium','low'] as const)('%s uses bounded texture submissions and reads simulation only',quality=>{
    let draws=0;const ctx=new Proxy({} as CanvasRenderingContext2D,{get:(_t,k)=>()=>{if(['drawImage','fill','stroke'].includes(String(k)))draws++;},set:()=>true});
    const camera=createCamera({x:0,y:0},800,600),state=createVisualState(firstLevel.players);state.sources.forEach(s=>s.weight=1);
    const before=structuredClone({state,camera});
    const b={shades:[{},{}] as [HTMLCanvasElement,HTMLCanvasElement],texture:{} as HTMLCanvasElement,view:{width:800,height:600} as HTMLCanvasElement,key:'',viewKey:'800,600,0,0,0.8',stars:generateStars(),generationMs:0};
    drawBackground(ctx,b,camera,state,{...DEFAULT_WARP,quality},DEFAULT_ART,{dx:0,dy:0,luminance:0});
    expect({state,camera}).toEqual(before);expect(draws).toBeLessThanOrEqual(150);if(quality==='low')expect(draws).toBe(6);
  });
});
describe('organic energy projections',()=>{
  it('bakes deterministic looping, transparent and nonuniform textures for both identities',()=>{
    for(const polarity of [1,-1] as const){
      const a=nodeFrame(polarity,0,48),b=nodeFrame(polarity,1,48);
      expect(a).toEqual(nodeFrame(polarity,NODE_FRAMES,48));expect(a).not.toEqual(b);
      expect(a[3]).toBe(0);expect(a[(24*48+24)*4+3]).toBeGreaterThan(220);
      const ring=[0,1,2,3].map(i=>{const angle=i*Math.PI/2,x=Math.round(24+12*Math.cos(angle)),y=Math.round(24+12*Math.sin(angle));return a[(y*48+x)*4+3];});
      expect(new Set(ring).size).toBeGreaterThan(1);
      let delta=0;for(let i=3;i<a.length;i+=4)delta+=Math.abs(a[i]-b[i]);expect(delta/(a.length/4)).toBeLessThan(15);
    }expect(nodeFrame(1,0,32)).not.toEqual(nodeFrame(-1,0,32));
  });
  it('keeps a round cloud rather than high-contrast arms through all animation frames',()=>{
    for(const polarity of [1,-1] as const)for(let f=0;f<NODE_FRAMES;f+=3){const pixels=nodeFrame(polarity,f,128);
      for(const radius of [20,32,45]){const values=Array.from({length:32},(_,i)=>{const a=i*Math.PI/16,x=Math.round(63.5+Math.cos(a)*radius),y=Math.round(63.5+Math.sin(a)*radius);return pixels[(y*128+x)*4+3];});
        // Two alpha bytes of tolerance at the almost transparent outer edge.
        expect(Math.max(...values)).toBeLessThanOrEqual(Math.min(...values)*1.9+2);}
    }
  });
  it('near-field particles are bounded and blue moves inward while gold moves outward',()=>{
    const state=createVisualState(firstLevel.players);state.sources.forEach(s=>s.weight=1);
    for(const s of state.sources){let compared=0;
      for(let i=0;i<24;i++) {const a=particlePoint(s,i,0),b=particlePoint(s,i,.01),r=Math.hypot(a.x-s.position.x,a.y-s.position.y),next=Math.hypot(b.x-s.position.x,b.y-s.position.y);
        expect(r).toBeLessThanOrEqual(56.001);expect(a.alpha).toBeGreaterThanOrEqual(0);expect(a.alpha).toBeLessThanOrEqual(1);
        if(Math.abs(next-r)<1){expect((next-r)*s.field.polarity).toBeLessThan(0);compared++;}}
      expect(compared).toBeGreaterThan(20);
    }
  });
  it('retains bounded real-position history, freezes and resets with the visual clock',()=>{
    const players=structuredClone(firstLevel.players),state=createVisualState(players);players[0].active=true;
    for(let i=0;i<100;i++){players[0].position.x+=2;updateVisuals(state,players,'running',0,1/60,DEFAULT_WARP);}
    expect(state.sources[0].history.length).toBe(16);expect(state.sources[0].nodeClock).toBeGreaterThan(0);
    const before=structuredClone(state);updateVisuals(state,players,'paused',0,1,DEFAULT_WARP);expect(state).toEqual(before);
    updateVisuals(state,players,'paused',1,1,DEFAULT_WARP);expect(state.sources[0].nodeClock).toBe(0);expect(state.sources[0].history[0]).toBe(players[0].position.x);
  });
  it('draws a finite particle/texture budget without modifying source, player or camera',()=>{
    const state=createVisualState(firstLevel.players),p=firstLevel.players[0],s=state.sources[0],camera=createCamera({x:0,y:0});s.weight=1;s.nodeClock=.1;
    const before=structuredClone({state,p,camera}),commands:string[]=[];
    const ctx=new Proxy({} as CanvasRenderingContext2D,{get:(_t,k)=>()=>commands.push(String(k)),set:()=>true});
    drawNode(ctx,{canvas:{} as HTMLCanvasElement,ready:true,failed:false,generationMs:0},p,s,state,camera,DEFAULT_ART,'high',0);
    expect({state,p,camera}).toEqual(before);expect(commands.filter(c=>c==='rect').length).toBeLessThanOrEqual(24);expect(commands.filter(c=>c==='drawImage').length).toBeLessThanOrEqual(6);
    commands.length=0;drawNode(ctx,{canvas:{} as HTMLCanvasElement,ready:true,failed:false,generationMs:0},p,s,state,camera,DEFAULT_ART,'low',0);
    expect(commands.filter(c=>c==='drawImage').length).toBe(1);expect(commands).not.toContain('rect');
  });
});
describe('world anchored visual transforms',()=>{
  it('moves original star positions and nebula texels with the same 1:1 camera mapping at every zoom',()=>{
    const players=structuredClone(firstLevel.players);players[0].position={x:0,y:0};players[1].position={x:180,y:0};const state=createVisualState(players);state.sources.forEach(s=>s.weight=1);
    for(const zoom of [.5,1,1.5])for(const cameraX of [-80,0,120]){
      const camera=createCamera({x:cameraX,y:30},800,600);camera.zoom=zoom;
      const rects:number[][]=[],transforms:number[][]=[];
      const ctx=new Proxy({} as CanvasRenderingContext2D,{get:(_t,k)=>(...args:number[])=>{if(k==='rect')rects.push(args);},set:()=>true});
      const viewCtx=new Proxy({} as CanvasRenderingContext2D,{get:(_t,k)=>(...args:number[])=>{if(k==='setTransform')transforms.push(args);if(k==='createPattern')return {};},set:()=>true});
      const b={shades:[{},{}] as [HTMLCanvasElement,HTMLCanvasElement],texture:{} as HTMLCanvasElement,view:{width:800,height:600,getContext:()=>viewCtx} as unknown as HTMLCanvasElement,key:'',viewKey:'',stars:Float32Array.from([100,50,.7,.2,.1]),generationMs:0};
      const before=structuredClone(state);drawBackground(ctx,b,camera,state,DEFAULT_WARP,DEFAULT_ART,{dx:0,dy:0,luminance:0});
      const expected=worldToScreen(camera,{x:100,y:50}),d=sampleDisturbance({dx:0,dy:0,luminance:0},100,50,state,DEFAULT_WARP,zoom,224);
      expect(rects[0][0]).toBeCloseTo(expected.x+d.dx,8);expect(rects[0][1]).toBeCloseTo(expected.y+d.dy,8);
      expect(transforms[0][0]).toBeCloseTo(zoom*2400/1024,8);expect(transforms[0][4]).toBeCloseTo(400-cameraX*zoom,8);expect(transforms[0][5]).toBeCloseTo(300-30*zoom,8);
      expect(state).toEqual(before);expect(visualAnchors(players,state,camera).every(a=>a.error===0)).toBe(true);
    }
  });
  it('selects a fixed, bounded world lattice independent of camera and retains event origins',()=>{
    const players=structuredClone(firstLevel.players),state=createVisualState(players);players.forEach(p=>p.active=true);
    for(let i=0;i<120;i++)updateVisuals(state,players,'running',0,1/60,DEFAULT_WARP);
    const original=structuredClone(state),cells=worldCells(state,DEFAULT_WARP);
    for(let i=0;i<50;i++){const camera=createCamera({x:i*50,y:i*10});camera.zoom=.2+i*.02;visualAnchors(players,state,camera);expect(worldCells(state,DEFAULT_WARP)).toEqual(cells);}
    expect(state).toEqual(original);expect(cells.length).toBeLessThanOrEqual(48);expect(cells.every(c=>c.x%256===0&&c.y%256===0)).toBe(true);
    expect(worldCells(state,{...DEFAULT_WARP,quality:'medium'}).length).toBeLessThanOrEqual(32);
  });
});

describe('one world material, composed fields',()=>{
  it('samples continuous periodic world fabric independently of camera and node identity',()=>{
    for(const x of [-2400,-1,0,135,2400]){
      expect(worldFabric(x,47)).toBeCloseTo(worldFabric(x+2400,47),12);
      expect(worldFabric(x,47)).toBeCloseTo(worldFabric(x,2447),12);
    }
    expect(worldFabric(-1e-6,37)).toBeCloseTo(worldFabric(1e-6,37),8);
  });
  it('uses one brightness material at a fixed world site, rather than moving a node-local cloud',()=>{
    const state=createVisualState(firstLevel.players),a=state.sources[0];a.weight=1;state.sources[1].weight=0;
    const c={...DEFAULT_WARP,idle:0,interaction:false},sample=()=>({...sampleDisturbance({dx:0,dy:0,luminance:0},120,80,state,c,1)});
    a.position={x:20,y:80};const left=sample();a.position={x:220,y:80};a.phase+=1;const right=sample();
    expect(left.luminance).toBeCloseTo(right.luminance,12);expect(left.dx).toBeCloseTo(-right.dx,12);
    const b=state.sources[1];b.weight=1;b.position={...a.position};b.field={...a.field,polarity:-1};b.table=a.table;
    expect(sample()).toEqual({dx:0,dy:0,luminance:0});
  });
  it('freezes animation and event generation while still reading moving nodes without writing physics',()=>{
    const players=structuredClone(firstLevel.players),state=createVisualState(players);players.forEach(p=>p.active=true);
    for(let i=0;i<3;i++){
      players[0].position.x+=50;players[0].velocity.x=260;const before=structuredClone(players);
      updateVisuals(state,players,'running',0,1/60,DEFAULT_WARP,true);
      expect(players).toEqual(before);expect(state.time).toBe(0);expect(state.emitted).toBe(0);
      expect(state.sources[0].nodeClock).toBe(0);expect(state.sources[0].position).toEqual(players[0].position);
      expect(state.sources[0].history[0]).toBe(players[0].position.x);
    }
    updateVisuals(state,players,'running',0,1/60,DEFAULT_WARP,false);expect(state.time).toBeGreaterThan(0);
  });
});
