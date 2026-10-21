import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {connect,setup,gameUrl} from './endless-qa/browser.mjs';
const folder=fileURLToPath(new URL('../docs/solar-system-visuals/',import.meta.url));
const c=await connect();
try{
  await c.send('Page.navigate',{url:gameUrl()});await new Promise(r=>setTimeout(r,800));await c.eval(setup);
  const result=await c.eval(`(async()=>{
    const p=await import('/src/render/solar-planets.ts'),k=await import('/src/render/solar-planet-material.ts');
    p.clearSolarPlanetCache();const canvas=document.createElement('canvas');canvas.width=canvas.height=320;
    const ctx=canvas.getContext('2d',{willReadFrequently:true}),camera=qa.createCamera({x:0,y:0},320,320);camera.zoom=1;
    const ids=k.SOLAR_PLANETS,bodies=ids.map(id=>({...qa.solarSystem.bodies.find(b=>b.id===id),position:{x:0,y:0},radius:100}));
    const paint=(b,t=18,z=1)=>{ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,320,320);camera.zoom=z;
      ctx.translate(160,160);ctx.scale(z,z);ctx.translate(-camera.position.x,-camera.position.y);p.drawSolarPlanet(ctx,b,t,camera,'high');};
    const cold=[];for(const b of bodies){const start=performance.now();paint(b);cold.push(performance.now()-start);}
    for(const z of [.1,.3,1])for(const b of bodies)paint(b,18,z);
    for(let wait=0;p.solarPlanetCacheStats().pending&&wait<200;wait++)await new Promise(r=>setTimeout(r,25));
    const warm=p.solarPlanetCacheStats();
    const pixels=()=>ctx.getImageData(0,0,320,320).data;
    const diff=(a,b)=>{let channels=0,max=0,total=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d)channels++;max=Math.max(max,d);total+=d;}return {channels,max,mean:total/a.length};};
    const checks=[];
    for(const b of bodies){
      const original=JSON.stringify(b);paint(b);const first=pixels();paint(b);const frozen=diff(first,pixels());
      camera.position={x:6123,y:-412};paint({...b,position:{...camera.position}});const translated=diff(first,pixels());camera.position={x:0,y:0};
      paint(b,18+1/60);const adjacent=diff(first,pixels());paint(b,48);const motion=diff(first,pixels());
      let outside=0;paint(b);const image=pixels();if(b.id!=='saturn')for(let y=0;y<320;y++)for(let x=0;x<320;x++)if(Math.hypot(x+.5-160,y+.5-160)>101&&image[(y*320+x)*4+3])outside++;
      checks.push({id:b.id,frozen,translated,adjacent,motion,outside,readOnly:original===JSON.stringify(b)});
    }
    const atlas=document.createElement('canvas');atlas.width=960;atlas.height=320;const actx=atlas.getContext('2d');
    for(const [i,t] of [0,18,48].entries()){
      paint(bodies.find(b=>b.id==='earth'),t);actx.fillStyle='#070b12';actx.fillRect(i*320,0,320,320);actx.drawImage(canvas,i*320,0);
      actx.fillStyle='#e7eff7';actx.font='14px system-ui';actx.fillText('EARTH · '+t+' s',i*320+12,24);
    }
    const saturn=bodies.find(b=>b.id==='saturn');paint({...saturn,radius:40,position:{x:230,y:0}});
    const ringVisible=pixels().some((v,i)=>i%4===3&&v>0);
    const times=[];for(let n=0;n<300;n++){const start=performance.now();for(const b of bodies)paint(b,18,n%3===0?.1:n%3===1?.3:1);times.push(performance.now()-start);}
    times.sort((a,b)=>a-b);return {environment:{userAgent:navigator.userAgent,cores:navigator.hardwareConcurrency,dpr:devicePixelRatio},coldPreviewMs:cold,
      warm,afterStress:p.solarPlanetCacheStats(),checks,ringVisible,renderNine:{p50:times[150],p95:times[285]},motionPng:atlas.toDataURL('image/png').split(',')[1]};
  })()`);
  for(const item of result.checks){assert.equal(item.frozen.channels,0);assert.equal(item.translated.channels,0);assert.equal(item.outside,0);assert.equal(item.readOnly,true);assert(item.adjacent.mean<.05);}
  assert(result.checks.find(x=>x.id==='earth').motion.channels>0);assert(result.ringVisible);
  assert.equal(result.warm.entries,27);assert.equal(result.warm.pending,0);assert.deepEqual(result.warm,result.afterStress);
  assert.equal(c.errors.length,0);result.errors=c.errors;
  await fs.writeFile(folder+'cloud-motion.png',Buffer.from(result.motionPng,'base64'));delete result.motionPng;
  await fs.writeFile(folder+'audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{c.close();}
