import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {connect,setup} from './endless-qa/browser.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),folder=path.join(root,'docs','endless-v3'),c=await connect();
try{
 await c.send('Page.navigate',{url:process.env.ARK_URL||'http://127.0.0.1:5184/?dev=1&scene=endless'});await new Promise(r=>setTimeout(r,1000));await c.eval(setup);
 const native=await c.eval(`(async()=>{
  const h=await import('/tools/endless-v3-harness.ts'),{createGame}=h.game,{endlessLevel}=h,{IndexedDBExpeditionStore}=h.storage,rt=h.runtime,u=h.universe;
  const times={read:[],write:[]};class TimedStore extends IndexedDBExpeditionStore{async read(...args){const t=performance.now();try{return await super.read(...args);}finally{times.read.push(performance.now()-t);}}async write(...args){const t=performance.now();try{return await super.write(...args);}finally{times.write.push(performance.now()-t);}}}
  const store=new TimedStore('ark-return-qa-'+crypto.randomUUID()),g=createGame(endlessLevel);rt.attachExpeditionStore(g,store);const b=g.bodies.find(b=>b.kind==='planet'),owner={...b.chunk},id=b.id;
  b.position={x:500*2048+500,y:600*2048+700};b.velocity={x:17,y:-8};b.stabilizationState={playerVelocity:{x:1,y:2},idleTime:4};
  const deleted=g.bodies.find(p=>p.chunk&&p.chunk.x===owner.x&&p.chunk.y===owner.y&&p!==b);if(deleted)g.bodies=g.bodies.filter(p=>p!==deleted);
  const visit=async(x,y)=>{g.bodies[0].position={x:(x-g.universe.origin.x)*2048,y:(y-g.universe.origin.y)*2048};g.players.forEach(p=>p.position={...g.bodies[0].position});u.rebaseUniverse(g);u.streamUniverse(g);await rt.settleExpedition(g);};
  let maxHot=0,maxLoaded=0,maxBodies=0;for(let i=0;i<45;i++){await visit(20+i*4,-20);maxHot=Math.max(maxHot,g.universe.cache.length);maxLoaded=Math.max(maxLoaded,g.universe.loaded.length);maxBodies=Math.max(maxBodies,g.bodies.length);}
  const evicted=g.universe.coldStats?.records>32&&!g.bodies.some(p=>p.id===id)&&!g.universe.cache.some(c=>c.key.x===owner.x&&c.key.y===owner.y);await visit(500,600);const moved=g.bodies.find(b=>b.id===id),returned=!!moved&&moved.position.x===500&&moved.position.y===700&&moved.velocity.x===17&&moved.stabilizationState.idleTime===4;
  const deletionPreserved=!deleted||!g.bodies.some(b=>b.id===deleted.id);return {evicted,returned,deletionPreserved,maxHot,maxLoaded,maxBodies,stats:g.universe.coldStats,times};
 })()`);assert.ok(native.evicted&&native.returned&&native.deletionPreserved);assert.ok(native.maxHot<=32&&native.maxLoaded<=54&&native.maxBodies<=325);
 const examples=JSON.parse(await fs.readFile(path.join(folder,'distribution.json'),'utf8')).examples,results=[];
 for(const [name,signature] of [['binary','binary:0p/2b'],['rogue','rogue:1p/1b'],['rocks','rocks:0p/3b']]){
  const example=examples[signature];
  const result=await c.eval(`(async()=>{
   const h=await import('/tools/endless-v3-harness.ts'),{createGame,stepGame}=h.game,{endlessLevel,runtime,universe,generator:gen}=h,{MemoryExpeditionStore}=h.storage,bridge=await import('/src/render/endless-bridge.ts'),art=await import('/src/render/spacetime/art.ts');
   const key={x:${example.x},y:${example.y}},seed=${example.seed},chunk=gen.generateChunk(seed,key,3),center={x:key.x*2048+chunk.center.x,y:key.y*2048+chunk.center.y};
   const g=createGame({...endlessLevel,seed}),ship=g.bodies[0];runtime.attachExpeditionStore(g,new MemoryExpeditionStore());ship.position={x:center.x-${name==='rocks'?350:600},y:center.y+${name==='rocks'?360:name==='rogue'?180:400}};ship.velocity={x:90,y:0};g.players.forEach((p,i)=>{p.position={x:ship.position.x+(i?-120:120),y:ship.position.y+(i?100:-100)};});universe.rebaseUniverse(g);universe.streamUniverse(g);await runtime.settleExpedition(g);g.phase='running';
   const baseline=structuredClone(g);runtime.attachExpeditionStore(baseline,new MemoryExpeditionStore());const initial={ship:structuredClone(ship),origin:{...g.universe.origin},players:structuredClone(g.players),key,seed};
   const controls=(state,active)=>{const ship=state.bodies[0],u=state.universe,rockCenter={x:center.x-u.origin.x*2048,y:center.y-u.origin.y*2048};return {players:state.players.map((_,i)=>({moveX:0,moveY:0,abilityActive:active,targetWorldPosition:${name==='rocks'?'i?{x:rockCenter.x-70,y:rockCenter.y+180}:{x:ship.position.x+130,y:ship.position.y}':'{x:ship.position.x+(i?-150:130),y:ship.position.y+(i?50:-30)}'}}))};};
   const paint=()=>{qa.game=g;qa.camera=qa.createCamera({x:center.x-g.universe.origin.x*2048,y:center.y-g.universe.origin.y*2048},1200,720);qa.camera.zoom=.65;qa.visuals=qa.createVisualState(g.players);bridge.syncUniverseVisuals(qa.visuals,g);qa.renderer=qa.createDemoRenderer();qa.render(qa.ctx,g,{points:[],seconds:0,outcome:'horizon'},qa.camera,{enhanced:true,visuals:qa.visuals,renderer:qa.renderer,warp:{...qa.DEFAULT_WARP,quality:'high'},art:art.levelArt(art.CINEMATIC_ART,g.level.id)});};
   let maxBudget=0;for(let i=0;i<240;i++){stepGame(g,controls(g,true));if(runtime.expeditionRuntime(g).pending)await runtime.settleExpedition(g);stepGame(baseline,controls(baseline,false));if(runtime.expeditionRuntime(baseline).pending)await runtime.settleExpedition(baseline);maxBudget+=Number(!!g.collisionBudgetExhausted);if(g.phase==='failed')break;}
   paint();for(let n=0;n<15;n++){await new Promise(r=>setTimeout(r,60));qa.render(qa.ctx,g,{points:[],seconds:0,outcome:'horizon'},qa.camera,{enhanced:true,visuals:qa.visuals,renderer:qa.renderer,warp:{...qa.DEFAULT_WARP,quality:'high'},art:art.levelArt(art.CINEMATIC_ART,g.level.id)});}const target=g.bodies.filter(b=>b.chunk&&b.chunk.x===key.x&&b.chunk.y===key.y),displacements=target.map(b=>{const old=baseline.bodies.find(p=>p.id===b.id);return {id:b.id,kind:b.kind,delta:old?Math.hypot(b.position.x-old.position.x,b.position.y-old.position.y):null};});
   const png=qa.canvas.toDataURL('image/png').split(',')[1];return {name:'${name}',initial,elapsed:g.elapsed,phase:g.phase,hp:g.health.current,shipVelocity:g.bodies[0].velocity,baselineVelocity:baseline.bodies[0].velocity,bothFields:g.players.map(p=>p.active),displacements,maxBudget,png};
  })()`);
  await fs.writeFile(path.join(folder,`case-${name}.png`),Buffer.from(result.png,'base64'));delete result.png;await fs.writeFile(path.join(folder,`case-${name}.json`),JSON.stringify(result,null,2));results.push(result);assert.equal(result.phase,'running');assert.equal(result.maxBudget,0);assert.ok(result.bothFields.every(Boolean));assert.ok(result.displacements.some(d=>d.delta>.001));
 }
 await fs.writeFile(path.join(folder,'interaction-cases.json'),JSON.stringify({native,results,errors:c.errors},null,2));assert.equal(c.errors.length,0);console.log(JSON.stringify({native:{...native,times:undefined},cases:results.map(r=>({name:r.name,phase:r.phase,displacements:r.displacements})),errors:c.errors.length}));
}finally{c.close();}
