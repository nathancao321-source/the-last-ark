import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {connect,setup} from './endless-qa/browser.mjs';

// A dedicated local CDP browser is required; no personal profile is accessed.
const mode=process.argv[2]??'after';
assert.ok(['before','after'].includes(mode));
const root=fileURLToPath(new URL('../',import.meta.url));
const folder=path.join(root,'docs','jet-tail-repair');
const raw=path.join(root,'.local','jet-tail-repair');
await fs.mkdir(folder,{recursive:true});
await fs.mkdir(raw,{recursive:true});
if(mode==='before')await fs.access(path.join(folder,'before-full.png')).then(()=>{throw Error('Baseline exists; do not overwrite it.');},e=>{if(e.code!=='ENOENT')throw e;});
const c=await connect();
try{
 await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
 await c.send('Page.navigate',{url:process.env.ARK_URL??'http://127.0.0.1:5182/?dev=1&scene=black_hole&fx=high'});
 await new Promise(r=>setTimeout(r,1200));
 await c.eval(setup);
 await c.eval(String.raw`(async()=>{
  const [{drawHazards,drawHazardColliders},{jetClock},{jetGeometry}]=await Promise.all([import('/src/render/hazards.ts'),import('/src/game/hazards.ts'),import('/src/game/hazard-geometry.ts')]);
  qa.jet={drawHazards,drawHazardColliders,jetClock,jetGeometry};
  qa.fixture('hole',5.4);qa.game.players.forEach(p=>p.position={x:1800,y:300});
  qa.canvas.width=1280;qa.canvas.height=800;qa.camera.width=1280;qa.camera.height=800;
  qa.setTime=t=>{const g=qa.game,source=g.bodies.find(b=>b.id===g.level.blackHoleJets.sourceId),clock=jetClock(g.level.blackHoleJets,t,source.nodeInfluence);g.elapsed=t;Object.assign(g.hazards.jet,clock,{geometry:jetGeometry(source.position,source.radius,g.level.blackHoleJets,clock)});};
  qa.paintJet=(time=5.4,zoom=.102,y=0,quality='high',colliders=false,only=false,filter='all',x=1300)=>{
   qa.setTime(time);qa.camera.position={x,y};qa.camera.zoom=zoom;
   if(!only){qa.render(qa.ctx,qa.game,{points:[],seconds:0,outcome:'horizon'},qa.camera,{enhanced:quality!=='off',visuals:qa.visuals,renderer:qa.renderer,warp:{...qa.DEFAULT_WARP,quality},art:qa.DEFAULT_ART,debugColliders:colliders});return;}
   const ctx=qa.ctx;ctx.resetTransform();ctx.fillStyle='#060910';ctx.fillRect(0,0,1280,800);ctx.save();ctx.translate(640,400);ctx.scale(zoom,zoom);ctx.translate(-x,-y);
   let fill=0;const counts={fill:0,stroke:0,vertices:0};
   const proxy=new Proxy(ctx,{get:(target,key)=>{
    if(key==='fill'||key==='stroke')return (...args)=>{
     const type=key==='fill'?(++fill%4===0?'filament':'plume'):target.lineWidth===48?'core':Math.abs(target.lineWidth-45.6)<.01?'tail':'detail';
     counts[key]++;if(filter==='all'||filter===type)target[key](...args);
    };
    if(key==='lineTo')return (...args)=>{counts.vertices++;target.lineTo(...args);};
    const value=target[key];return typeof value==='function'?value.bind(target):value;
   },set:(target,key,value)=>{target[key]=value;return true;}});
   drawHazards(proxy,qa.game,qa.camera,quality!=='off',quality);if(colliders)drawHazardColliders(ctx,qa.game,qa.camera);ctx.restore();return counts;
  };
  qa.image=()=>qa.canvas.toDataURL('image/png').split(',')[1];
  qa.paintJet();await new Promise(r=>setTimeout(r,1500));qa.paintJet();return true;
 })()`);
 const shot=async(name,args)=>{
  const data=await c.eval(`(()=>{qa.paintJet(...${JSON.stringify(args)});return qa.image();})()`);
  await fs.writeFile(path.join(folder,`${mode}-${name}.png`),Buffer.from(data,'base64'));
 };
 await shot('full',[5.4,.102,0]);
 await shot('upper-tip',[5.4,.65,-2950]);
 await shot('lower-tip',[5.4,.65,2950]);
 await shot('collider',[5.4,.5,-2650,'high',true]);
 await shot('root',[5.4,.65,0]);
 if(mode==='before')for(const layer of ['core','tail','plume','filament','detail'])await shot(`layer-${layer}`,[5.4,.65,-2950,'high',false,true,layer]);
 for(const quality of ['high','medium','low','off'])await shot(quality,[5.4,.102,0,quality,false,true]);
 // Pixel baseline for unrelated scenes and the no-jet region of fx=off.
 const pixels=await c.eval(String.raw`(()=>{
  const output={};for(const [name,kind]of [['solar','solar'],['hole','hole']]){
   qa.fixture(kind,5.4);qa.canvas.width=1280;qa.canvas.height=800;qa.camera.width=1280;qa.camera.height=800;qa.camera.zoom=.65;qa.camera.position={x:name==='hole'?0:900,y:0};qa.paint(true);
   output[name]=Array.from(qa.ctx.getImageData(0,0,1280,800).data);
  }qa.fixture('hole',5.4);qa.camera.width=1280;qa.camera.height=800;return output;
 })()`);
 for(const [name,data]of Object.entries(pixels)){
  const file=path.join(raw,`before-off-${name}.rgba`),bytes=Buffer.from(data);
  if(mode==='before')await fs.writeFile(file,bytes);
  else assert.deepEqual(bytes,await fs.readFile(file),`unrelated fx=off ${name} pixels`);
 }
 const perf=await c.eval(String.raw`(async()=>{
  const report={};for(const quality of ['off','medium','high']){
   const render=[],hazards=[];let counts;
   for(let i=0;i<100;i++){
    let start=performance.now();qa.paintJet(5.4,.102,0,quality);const elapsed=performance.now()-start;
    start=performance.now();counts=qa.paintJet(5.4,.102,0,quality,false,true);const h=performance.now()-start;
    if(i>=20){render.push(elapsed);hazards.push(h);}if(i%10===0)await new Promise(requestAnimationFrame);
   }
   render.sort((a,b)=>a-b);hazards.sort((a,b)=>a-b);report[quality]={renderP50:render[40],renderP95:render[76],hazardsP50:hazards[40],hazardsP95:hazards[76],counts};
  }return report;
 })()`);
 const report={mode,perf,errors:c.errors,userAgent:await c.eval('navigator.userAgent'),resolution:[1280,800],dpr:1};
 if(mode==='after'){
  const result=await c.eval(String.raw`(async()=>{
   const times=[3,3.8,4.8,4.999,5,5.2,5.6,5.799,5.8,6,6.4,6.55],sheet=document.createElement('canvas');sheet.width=1280;sheet.height=1200;const out=sheet.getContext('2d');
   for(let i=0;i<times.length;i++){
    qa.paintJet(times[i],.102,0,'high',false,true);out.drawImage(qa.canvas,0,0,1280,800,i%4*320,Math.floor(i/4)*400,320,400);out.fillStyle='#fff';out.font='14px monospace';out.fillText(times[i]+' '+qa.game.hazards.jet.phase,i%4*320+8,Math.floor(i/4)*400+18);
   }
   const frames=[],deltas=[],render=[],phases=new Set(),start=performance.now();let last=start,next=0;
   const stream=qa.canvas.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm'});
   const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start();
   await new Promise(resolve=>{const tick=now=>{
    const elapsed=Math.max(0,(now-start)/1000);deltas.push(Math.max(0,now-last));last=now;const before=performance.now();
    qa.paintJet(3+Math.min(5,elapsed),.102,0);render.push(performance.now()-before);phases.add(qa.game.hazards.jet.phase);
    if(elapsed>=next&&frames.length<12){frames.push({time:qa.game.elapsed,phase:qa.game.hazards.jet.phase,png:qa.image()});next+=.45;}
    if(elapsed>=5){resolve();return;}requestAnimationFrame(tick);
   };requestAnimationFrame(tick);});recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());
   const liveSheet=document.createElement('canvas');liveSheet.width=1280;liveSheet.height=1200;const liveOut=liveSheet.getContext('2d');
   for(let i=0;i<frames.length;i++){
    const picture=new Image();picture.src='data:image/png;base64,'+frames[i].png;await picture.decode();
    liveOut.drawImage(picture,i%4*320,Math.floor(i/4)*400,320,400);liveOut.fillStyle='#fff';liveOut.font='14px monospace';liveOut.fillText(frames[i].time.toFixed(3)+' '+frames[i].phase,i%4*320+8,Math.floor(i/4)*400+18);
   }
   const blob=new Blob(chunks,{type:'video/webm'}),bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
   render.sort((a,b)=>a-b);deltas.sort((a,b)=>a-b);
   // Isolate the animated hazard from the asynchronous background tile worker.
   qa.paintJet(5.4,.65,-2950,'high',false,true);const pauseA=qa.image();await new Promise(r=>setTimeout(r,200));qa.paintJet(5.4,.65,-2950,'high',false,true);const paused=pauseA===qa.image();
   const pans=[];for(const [x,y,zoom]of [[1300,-2950,.65],[1200,-2750,.5],[1400,2900,.8],[1300,0,.1]]){qa.paintJet(5.4,zoom,y,'high',true,false,'all',x);pans.push(qa.image());}
   return {sheet:sheet.toDataURL('image/png').split(',')[1],liveSheet:liveSheet.toDataURL('image/png').split(',')[1],frames,video:btoa(binary),paused,pans,live:{seconds:5,frames:render.length,phases:[...phases],renderP50:render[Math.floor(render.length*.5)],renderP95:render[Math.floor(render.length*.95)],rafP50:deltas[Math.floor(deltas.length*.5)],rafP95:deltas[Math.floor(deltas.length*.95)]}};
  })()`);
  await fs.writeFile(path.join(folder,'after-phases.png'),Buffer.from(result.sheet,'base64'));
  await fs.writeFile(path.join(folder,'after-live.png'),Buffer.from(result.liveSheet,'base64'));
  await fs.writeFile(path.join(folder,'after-cycle.webm'),Buffer.from(result.video,'base64'));
  for(let i=0;i<result.frames.length;i++)await fs.writeFile(path.join(raw,`after-live-${i}.png`),Buffer.from(result.frames[i].png,'base64'));
  for(let i=0;i<result.pans.length;i++)await fs.writeFile(path.join(folder,`after-pan-${i}.png`),Buffer.from(result.pans[i],'base64'));
  assert.ok(result.paused,'simulation-time pause must be pixel-identical');
  assert.deepEqual(result.live.phases,['warning','firing','dissipating','cooldown']);
  report.live=result.live;report.paused=result.paused;
  for(const name of ['full','upper-tip']){
   const pictures=await Promise.all(['before','after'].map(async prefix=>(await fs.readFile(path.join(folder,`${prefix}-${name}.png`))).toString('base64')));
   const comparison=await c.eval(`(async()=>{
    const images=await Promise.all(${JSON.stringify(pictures)}.map(async data=>{const p=new Image();p.src='data:image/png;base64,'+data;await p.decode();return p;}));
    const tip=${name==='upper-tip'},canvas=document.createElement('canvas');canvas.width=tip?560:1280;canvas.height=tip?840:440;const ctx=canvas.getContext('2d');ctx.fillStyle='#060910';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#fff';ctx.font='18px system-ui';
    for(let i=0;i<2;i++){ctx.fillText(i?'AFTER':'BEFORE',i*canvas.width/2+16,27);if(tip)ctx.drawImage(images[i],500,0,280,800,i*280,40,280,800);else ctx.drawImage(images[i],i*640,40,640,400);}
    return canvas.toDataURL('image/png').split(',')[1];
   })()`);
   await fs.writeFile(path.join(folder,`comparison-${name}.png`),Buffer.from(comparison,'base64'));
  }
 }
 assert.deepEqual(c.errors,[]);
 await fs.writeFile(path.join(folder,`${mode}-report.json`),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}finally{c.close();}
