import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {connect,setup} from './endless-qa/browser.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),folder=path.join(root,'docs','endless-v3');await fs.mkdir(folder,{recursive:true});
const c=await connect(),base=process.env.ARK_URL||'http://127.0.0.1:5184/',mode=process.argv[2]||'scenes';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(url){await c.send('Page.navigate',{url});for(let n=0;n<100;n++){await wait(150);if(await c.eval('!!window.__arkDev?.scenes?.game'))return;}throw Error('Game did not boot');}
const key=async(code,key,down=true)=>c.send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,key,windowsVirtualKeyCode:code==='Space'?32:code==='Enter'?13:code==='ArrowLeft'?37:code==='ArrowRight'?39:code.startsWith('Key')?code.charCodeAt(3):0});
const press=async(code,name)=>{await key(code,name);await key(code,name,false);};
try{
 await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
 if(mode==='flight'){
  const version=Number(process.argv[3]||3),seed=Number(process.argv[4]||20261017),seconds=Number(process.argv[5]||220);
  await ready(`${base}?dev=1&scene=endless&generator=${version}&seed=${seed}&fx=medium`);
  const data=await c.eval(`(async()=>{
   const dev=__arkDev,{cruiseControls}=await import('/tools/endless-v3-controller.ts'),runtime=(await import('/tools/endless-v3-harness.ts')).runtime;
   for(let i=0;i<2;i++)dev.inputs.setSource(i,{read:()=>cruiseControls(dev.scenes.game).players[i],releaseMovement(){},reset(){}});
   const g=dev.scenes.game;dev.scenes.toggle();const started=performance.now(),frames=[],work=[],interval=[],loads=[],samples=[],usage=[0,0],keys=new Set();let previous=started,loadStart,next=0,maxBodies=0,maxLoaded=0,maxCache=0,maxTiles=0,maxJump=0,lastPosition={x:0,y:0};
   const canvas=document.querySelector('#game'),sheet=document.createElement('canvas');sheet.width=1280;sheet.height=720;const ctx=sheet.getContext('2d');ctx.fillStyle='#070b15';ctx.fillRect(0,0,1280,720);
   const stream=canvas.captureStream(15),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm'});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const stopped=new Promise(r=>recorder.onstop=r);recorder.start();
   await new Promise(resolve=>{const tick=now=>{
    const u=g.universe,ship=g.bodies[0],x=ship.position.x+u.origin.x*2048,y=ship.position.y+u.origin.y*2048,cell={x:Math.floor(x/2048),y:Math.floor(y/2048)};keys.add(JSON.stringify(cell));
    interval.push(now-previous);previous=now;work.push(dev.workSamples.at(-1)??0);maxBodies=Math.max(maxBodies,g.bodies.length);maxLoaded=Math.max(maxLoaded,u.loaded.length);maxCache=Math.max(maxCache,u.cache.length);maxJump=Math.max(maxJump,Math.hypot(x-lastPosition.x,y-lastPosition.y));lastPosition={x,y};
    if(runtime.expeditionRuntime(g).pending){loadStart??=now;}else if(loadStart!==undefined){loads.push(now-loadStart);loadStart=undefined;}
    g.players.forEach((p,i)=>{if(p.active)usage[i]++;});
    if(g.elapsed>=next){samples.push({wall:(now-started)/1000,elapsed:g.elapsed,x,y,phase:g.phase,hp:g.health.current,loaded:u.loaded.length,bodies:g.bodies.length,cache:u.cache.length,cold:u.coldStats});
     if(frames.length<12){const i=frames.length,dx=i%4*320,dy=Math.floor(i/4)*240;ctx.drawImage(canvas,dx,dy+20,320,220);ctx.fillStyle='#fff';ctx.font='12px monospace';ctx.fillText('t='+g.elapsed.toFixed(1)+' | '+cell.x+','+cell.y,dx+5,dy+14);frames.push(g.elapsed);}next+=18;
    }
    window.__flightProgress={elapsed:g.elapsed,wall:(now-started)/1000,x,y,phase:g.phase,keys:keys.size};
    if(g.elapsed>=${seconds}||x>=12*2048||g.phase==='failed'||now-started>(${seconds}+90)*1000){resolve();return;}requestAnimationFrame(tick);
   };requestAnimationFrame(tick);});
   const resultPhase=g.phase;g.phase='paused';recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
   const quantiles=a=>{a.sort((a,b)=>a-b);return {p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)],max:a.at(-1),count:a.length};};
   return {version:${version},seed:${seed},phase:resultPhase,stoppedByRecorder:true,hp:g.health.current,message:g.message,elapsed:g.elapsed,wall:(performance.now()-started)/1000,position:lastPosition,origin:g.universe.origin,keys:[...keys].map(JSON.parse),usage,maxBodies,maxLoaded,maxCache,maxJump,work:quantiles([...work]),frameInterval:quantiles([...interval]),loads,samples,rawWork:work,rawFrames:interval,png:sheet.toDataURL('image/png').split(',')[1],video:btoa(binary),environment:{userAgent:navigator.userAgent,cores:navigator.hardwareConcurrency,dpr:devicePixelRatio,width:canvas.width,height:canvas.height,quality:'medium'}};
  })()`);
  const prefix=`${seconds>=200?'flight':'perf'}-v${version}-${seed}`;await fs.writeFile(path.join(folder,prefix+'.png'),Buffer.from(data.png,'base64'));await fs.writeFile(path.join(folder,prefix+'.webm'),Buffer.from(data.video,'base64'));delete data.png;delete data.video;data.environment.cpu=os.cpus()[0]?.model;data.environment.os=os.release();data.errors=c.errors;await fs.writeFile(path.join(folder,prefix+'.json'),JSON.stringify(data,null,2));assert.equal(data.hp,100);assert.equal(data.phase,'running');assert.equal(data.errors.length,0);if(seconds>=200)assert.ok(data.position.x>=12*2048);console.log(JSON.stringify({mode,prefix,elapsed:data.elapsed,wall:data.wall,position:data.position,keys:data.keys.length,work:data.work,errors:data.errors.length}));
 }else{
  await c.send('Page.navigate',{url:base});await wait(1200);await c.shot(path.join(folder,'title.png'));
  await ready(`${base}?dev=1&scene=endless&generator=3&seed=20261017&fx=medium`);await c.eval("document.querySelector('#game').focus()");
  const initial=await c.eval('structuredClone(__arkDev.scenes.game.players).map(p=>p.position)');
  await key('KeyD','d');await key('ArrowLeft','ArrowLeft');await press('KeyF','f');await press('Enter','Enter');await press('Space',' ');await wait(650);await key('KeyD','d',false);await key('ArrowLeft','ArrowLeft',false);
  const input=await c.eval('({players:__arkDev.scenes.game.players.map(p=>({position:p.position,active:p.active})),phase:__arkDev.scenes.game.phase})');assert.equal(input.phase,'running');assert.ok(input.players.every(p=>p.active));assert.ok(input.players[0].position.x>initial[0].x&&input.players[1].position.x<initial[1].x);
  await press('Space',' ');const paused=await c.eval('__arkDev.scenes.game.elapsed');await wait(300);assert.equal(await c.eval('__arkDev.scenes.game.elapsed'),paused);
  await press('KeyK','k');await wait(500);const saved=await c.eval('({notice:document.querySelector("#exploration-notice").textContent,elapsed:__arkDev.scenes.game.elapsed,world:__arkDev.scenes.game.universe.cold})');assert.match(saved.notice,/已保存/);
  await press('KeyH','h');await press('KeyJ','j');await press('Space',' ');await wait(300);await press('KeyL','l');await wait(600);
  const loaded=await c.eval('({phase:__arkDev.scenes.game.phase,elapsed:__arkDev.scenes.game.elapsed,world:__arkDev.scenes.game.universe.cold,fields:__arkDev.scenes.game.players.map(p=>p.active)})');assert.equal(loaded.phase,'paused');assert.equal(loaded.elapsed,saved.elapsed);assert.ok(loaded.fields.every(x=>!x));assert.equal(loaded.world.id,saved.world.id);assert.equal(loaded.world.epoch,saved.world.epoch+1);
  await press('KeyR','r');await wait(200);assert.notEqual(await c.eval('__arkDev.scenes.game.universe.cold.id'),saved.world.id);
  const native=await c.eval(`(async()=>{
   const {IndexedDBExpeditionStore,newWorld}=await import('/src/world/cold-store.ts'),{generateChunk}=await import('/src/world/generator.ts');
   const store=new IndexedDBExpeditionStore('ark-native-qa-'+crypto.randomUUID(),2000000),w=newWorld(7),snapshot={key:{x:2,y:2},bodies:generateChunk(7,{x:2,y:2},3).bodies};
   await store.write(w,[snapshot]);await store.save(w,[snapshot],'valid');const old=(await store.read(w,[snapshot.key]))[0];
   const original=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(names,...args){const tx=original.call(this,names,...args);if(Array.from(names).includes('saved'))queueMicrotask(()=>tx.abort());return tx;};let aborted=false;
   try{await store.save(w,[{...snapshot,bodies:[]}],'interrupted');}catch{aborted=true;}finally{IDBDatabase.prototype.transaction=original;}
   const restored=await store.restore(m=>m==='valid'),rows=await store.read(restored.world,[snapshot.key]);
   let stale=false;try{await store.write(w,[]);}catch{stale=true;}
   const quota=new IndexedDBExpeditionStore('ark-quota-qa-'+crypto.randomUUID(),1);let full=false;try{await quota.write(newWorld(7),[snapshot]);}catch{full=true;}
   return {aborted,stale,full,rollback:JSON.stringify(old.bodies)===JSON.stringify(rows[0].bodies),manifest:restored.manifest};
  })()`);assert.deepEqual(native,{aborted:true,stale:true,full:true,rollback:true,manifest:'valid'});
  await c.eval(setup);await c.eval(`(async()=>{Object.assign(qa,await import('/src/levels/endless.ts'));qa.universe=await import('/src/world/universe.ts');qa.runtime=(await import('/tools/endless-v3-harness.ts')).runtime;qa.bridge=await import('/src/render/endless-bridge.ts');qa.artModule=await import('/src/render/spacetime/art.ts');qa.background=await import('/src/render/endless-background.ts');qa.canvas.width=1280;qa.canvas.height=800;qa.canvas.style='position:fixed;inset:0;width:1280px;height:800px;z-index:99999';qa.paint=()=>qa.render(qa.ctx,qa.game,{points:[],seconds:0,outcome:'horizon'},qa.camera,{enhanced:true,visuals:qa.visuals,renderer:qa.renderer,warp:{...qa.DEFAULT_WARP,quality:'high'},art:qa.artModule.levelArt(qa.artModule.CINEMATIC_ART,qa.game.level.id)});})()`);
  const sample=await c.eval("(async()=>{const {sampleV3}=await import('/tools/endless-v3-sample.ts');return sampleV3();})()");await fs.writeFile(path.join(folder,'distribution.json'),JSON.stringify(sample,null,2));
  const views=[];
  for(const seed of [20261017,7,424242])for(const version of [2,3]){
   await c.eval(`(async()=>{if(qa.renderer?.endless)qa.background.resetEndlessBackground(qa.renderer.endless);qa.game=qa.createGame({...qa.endlessLevel,seed:${seed},generatorVersion:${version}});const g=qa.game;g.bodies[0].position={x:4112,y:2064};g.players.forEach((p,i)=>p.position={x:g.bodies[0].position.x+(i?-120:120),y:g.bodies[0].position.y+(i?140:-140)});qa.universe.streamUniverse(g,true);if(${version}===3)await qa.runtime.settleExpedition(g);qa.camera=qa.createCamera({x:5120,y:3072},1280,800);qa.camera.zoom=.22;qa.visuals=qa.createVisualState(g.players);qa.bridge.syncUniverseVisuals(qa.visuals,g);qa.renderer=qa.createDemoRenderer();qa.paint();})()`);
   for(let n=0;n<120;n++){await wait(80);if(await c.eval('(qa.paint(),qa.renderer.endless&&!qa.renderer.endless.busy&&!qa.renderer.endless.pending.length)'))break;}
   const png=await c.eval(`(()=>{qa.paint();const s=document.createElement('canvas');s.width=1280;s.height=800;const ctx=s.getContext('2d');ctx.drawImage(qa.canvas,0,0);ctx.fillStyle='#080d18';ctx.fillRect(0,765,1280,35);ctx.fillStyle='#fff';ctx.font='17px monospace';ctx.fillText('v${version} | Seed ${seed} | same world rectangle | layout fixture',20,789);return s.toDataURL('image/png').split(',')[1];})()`);
   const name=`layout-v${version}-${seed}.png`;await fs.writeFile(path.join(folder,name),Buffer.from(png,'base64'));views.push(name);
  }
  await fs.writeFile(path.join(folder,'browser-checks.json'),JSON.stringify({input,saved,loaded,native,views,errors:c.errors},null,2));assert.equal(c.errors.length,0);console.log(JSON.stringify({mode,views,native,inputs:true,saveLoad:true,errors:c.errors.length}));
 }
}finally{c.close();}
