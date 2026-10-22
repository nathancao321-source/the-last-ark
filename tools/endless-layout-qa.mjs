import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {start,warm} from './endless-qa/endless-fixture.mjs';
const mode=process.argv[2]??'after',root=fileURLToPath(new URL('../',import.meta.url)),folder=path.join(root,'docs','endless-layout');
assert.ok(['before','after'].includes(mode));await fs.mkdir(folder,{recursive:true});
if(mode==='before')await fs.access(path.join(folder,'before-20261017.png')).then(()=>{throw Error('Baseline already exists');},e=>{if(e.code!=='ENOENT')throw e;});
const c=await start(),report={mode,views:[],errors:[]};
try{
 await c.eval(`qa.canvas.width=1280;qa.canvas.height=800;qa.canvas.style='position:fixed;inset:0;width:1280px;height:800px;z-index:99999';`);
 for(const seed of [20261017,7,424242]){
  await c.eval(`qa.make(4112,2064,${seed});qa.camera.width=1280;qa.camera.height=800;qa.camera.position={x:5120,y:3072};qa.camera.zoom=.22;`);await warm(c);
  const data=await c.eval(`(()=>{
   qa.paint();const normal=qa.canvas.toDataURL('image/png').split(',')[1],canvas=document.createElement('canvas'),cam=qa.camera;
   canvas.width=1280;canvas.height=800;const ctx=canvas.getContext('2d');ctx.drawImage(qa.canvas,0,0);
   ctx.strokeStyle='#79b8cb';ctx.lineWidth=1;ctx.setLineDash([6,5]);ctx.font='12px monospace';ctx.fillStyle='#bcdae5';
   for(let x=1;x<=3;x++)for(let y=0;y<=2;y++){
    const sx=640+(x*2048-cam.position.x)*cam.zoom,sy=400+(y*2048-cam.position.y)*cam.zoom;
    ctx.strokeRect(sx,sy,2048*cam.zoom,2048*cam.zoom);ctx.fillText(x+','+y,sx+7,sy+18);
   }
   ctx.fillStyle='#080d18';ctx.fillRect(0,760,1280,40);ctx.fillStyle='#fff';ctx.font='17px monospace';ctx.fillText('Seed ${seed} | chunks x=1..3 y=0..2 | zoom=.22 | DEV snapshot',20,785);
   return {normal,overlay:canvas.toDataURL('image/png').split(',')[1],seed:${seed},chunks:qa.game.universe.loaded,layout:Array.from({length:9},(_,i)=>{
    const key={x:1+i%3,y:Math.floor(i/3)},g=qa.generator.generateChunk(${seed},key);return {key,feature:g.feature,center:g.center,bodies:g.bodies.map(b=>({id:b.id,kind:b.kind,position:b.position,radius:b.radius,velocity:b.velocity}))};
   })};
  })()`);
  await fs.writeFile(path.join(folder,`${mode}-${seed}.png`),Buffer.from(data.normal,'base64'));await fs.writeFile(path.join(folder,`${mode}-${seed}-grid.png`),Buffer.from(data.overlay,'base64'));
  delete data.normal;delete data.overlay;report.views.push(data);
 }
 if(mode==='before'){
  const saved=await c.eval(`(async()=>{qa.make(0,0);qa.advance(1);const {storeExploration}=await import('/src/game/exploration-save.ts');let text='';storeExploration({getItem:()=>null,setItem:(_k,v)=>text=v},qa.game);return text;})()`);
  await fs.writeFile(path.join(folder,'before-save-v1.json'),saved+'\n');
 }
 if(mode==='after'){
  const legacy=await fs.readFile(path.join(folder,'before-save-v1.json'),'utf8');
  report.legacy=await c.eval(`(async()=>{const {loadExploration}=await import('/src/game/exploration-save.ts');const text=${JSON.stringify(legacy)},saved=JSON.parse(text);let writes=0;const game=loadExploration({getItem:()=>text,setItem:()=>writes++});return {loaded:!!game,version:game?.universe?.generatorVersion,writes,bodiesUnchanged:JSON.stringify(game?.bodies)===JSON.stringify(saved.bodies),cacheUnchanged:JSON.stringify(game?.universe?.cache)===JSON.stringify(saved.universe.cache)};})()`);
  assert.deepEqual(report.legacy,{loaded:true,version:1,writes:0,bodiesUnchanged:true,cacheUnchanged:true});
  const stats=await c.eval(`(async()=>{const {layoutSample}=await import('/tools/layout-sample.ts');return {before:layoutSample(1),after:layoutSample(2)};})()`);
  await fs.writeFile(path.join(folder,'layout-distribution.json'),JSON.stringify(stats,null,2)+'\n');
  report.distribution=Object.fromEntries(Object.entries(stats).map(([k,{centers:_centers,...data}])=>[k,data]));
  // Real-time, fixed-step continuous flight. Only the initial ship velocity is
  // set; all later positions, streaming, gravity and rebases come from stepGame.
  const flight=await c.eval(`(async()=>{
   qa.make(0,0,20261017);qa.game.bodies[0].velocity={x:240,y:0};qa.camera.width=1280;qa.camera.height=800;qa.camera.zoom=.45;
   const {FixedClock}=await import('/src/game/clock.ts'),clock=new FixedClock(),frames=[],jumps=[],times=[],keys=new Set(),start=performance.now();let last=start,previous={x:0,y:0},maxLoaded=0,maxBodies=0,maxCache=0;
   keys.add(JSON.stringify(qa.universe.worldChunk(qa.game,qa.game.bodies[0].position)));
   const sheet=document.createElement('canvas');sheet.width=1280;sheet.height=660;const out=sheet.getContext('2d');out.fillStyle='#060910';out.fillRect(0,0,1280,660);let next=0;
   const stream=qa.canvas.captureStream(20),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm'});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const stopped=new Promise(r=>recorder.onstop=r);recorder.start();
   await new Promise(resolve=>{const tick=now=>{
    clock.advance(Math.min(.1,Math.max(0,(now-last)/1000)),()=>{
     qa.stepGame(qa.game,qa.NO_CONTROLS);const ship=qa.game.bodies[0],u=qa.game.universe,p={x:ship.position.x+u.origin.x*2048,y:ship.position.y+u.origin.y*2048};jumps.push(Math.hypot(p.x-previous.x,p.y-previous.y));previous=p;
     keys.add(JSON.stringify(qa.universe.worldChunk(qa.game,ship.position)));maxLoaded=Math.max(maxLoaded,u.loaded.length);maxBodies=Math.max(maxBodies,qa.game.bodies.length);maxCache=Math.max(maxCache,u.cache.length);
    });last=now;
    qa.camera.position={...qa.game.bodies[0].position};qa.bridge.syncUniverseVisuals(qa.visuals,qa.game);const before=performance.now();qa.paint('medium');times.push(performance.now()-before);
    if(qa.game.elapsed>=next&&frames.length<12){const i=frames.length;out.drawImage(qa.canvas,i%4*320,Math.floor(i/4)*220+20,320,200);out.fillStyle='#fff';out.font='12px monospace';out.fillText('t='+qa.game.elapsed.toFixed(2)+' | '+[...keys].at(-1),i%4*320+8,Math.floor(i/4)*220+15);frames.push(qa.game.elapsed);next+=3.6;}
    if(qa.game.elapsed>=40||qa.game.phase!=='running'||now-start>55000){resolve();return;}requestAnimationFrame(tick);
   };requestAnimationFrame(tick);});recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());
   const bytes=new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer());let binary='';for(const b of bytes)binary+=String.fromCharCode(b);times.sort((a,b)=>a-b);
   return {png:sheet.toDataURL('image/png').split(',')[1],video:btoa(binary),phase:qa.game.phase,message:qa.game.message,elapsed:qa.game.elapsed,wallSeconds:(performance.now()-start)/1000,position:previous,origin:qa.game.universe.origin,chunks:[...keys].map(JSON.parse),maxJump:Math.max(...jumps),maxLoaded,maxBodies,maxCache,hp:qa.game.health.current,renderP50:times[Math.floor(times.length*.5)],renderP95:times[Math.floor(times.length*.95)]};
  })()`);
  await fs.writeFile(path.join(folder,'continuous-flight.png'),Buffer.from(flight.png,'base64'));await fs.writeFile(path.join(folder,'continuous-flight.webm'),Buffer.from(flight.video,'base64'));delete flight.png;delete flight.video;report.flight=flight;
  assert.equal(flight.phase,'running');assert.equal(flight.hp,100);assert.ok(flight.elapsed>=40);assert.ok(flight.maxJump<=4.00001);assert.ok(flight.chunks.length>=4);assert.ok(flight.origin.x>0);
  const pictures=await Promise.all([20261017,7,424242].flatMap(seed=>['before','after'].map(async prefix=>({seed,prefix,data:(await fs.readFile(path.join(folder,`${prefix}-${seed}-grid.png`))).toString('base64')}))));
  const comparison=await c.eval(`(async()=>{
   const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=1320;const ctx=canvas.getContext('2d');ctx.fillStyle='#060910';ctx.fillRect(0,0,1280,1320);
   const pictures=${JSON.stringify(pictures)};for(let i=0;i<pictures.length;i++){
    const {seed,prefix,data}=pictures[i],image=new Image();image.src='data:image/png;base64,'+data;await image.decode();const x=i%2*640,y=Math.floor(i/2)*440;
    ctx.drawImage(image,x,y+40,640,400);ctx.fillStyle='#fff';ctx.font='18px monospace';ctx.fillText(prefix.toUpperCase()+' | Seed '+seed,x+16,y+27);
   }return canvas.toDataURL('image/png').split(',')[1];
  })()`);
  await fs.writeFile(path.join(folder,'comparison-seeds.png'),Buffer.from(comparison,'base64'));
 }
 report.errors=c.errors;assert.deepEqual(c.errors,[]);await fs.writeFile(path.join(folder,`${mode}-report.json`),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({mode,seeds:report.views.map(v=>v.seed),errors:c.errors}));
}finally{c.close();}
