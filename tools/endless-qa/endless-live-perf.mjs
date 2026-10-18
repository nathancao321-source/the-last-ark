import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {start} from './endless-fixture.mjs';
import {evidencePath,gameUrl} from './browser.mjs';
const c=await start(),report={environment:'Edge headless, local dev build, actual main loop including physics/prediction/UI/render',cases:[],errors:[]};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function key(code,key,vk,type='keyDown'){await c.send('Input.dispatchKeyEvent',{type,code,key,windowsVirtualKeyCode:vk});}
try{
 const saves=await c.eval(`(async()=>{const {storeExploration}=await import('/src/game/exploration-save.ts');return [[0,0],[7168,1024],[27648,-5120]].map(([x,y])=>{qa.make(x,y);let save='';storeExploration({getItem:()=>null,setItem:(_k,v)=>save=v},qa.game);return save;});})()`);
 for(const [index,name] of ['deep','triple','nebula'].entries()){
  await c.eval(`localStorage.setItem('the-last-ark.exploration.v1',${JSON.stringify(saves[index])})`);await c.send('Page.navigate',{url:gameUrl()});await wait(900);await c.send('Emulation.setDeviceMetricsOverride',{width:1200,height:720,deviceScaleFactor:1,mobile:false});
  await c.eval(`document.querySelector('#game').focus()`);await key('KeyL','l',76);await key('KeyL','l',76,'keyUp');await wait(250);
  const box=await c.eval(`(()=>{const b=document.querySelector('#fullscreen-toggle').getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()`);await c.send('Input.dispatchMouseEvent',{type:'mousePressed',...box,button:'left',clickCount:1});await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',...box,button:'left',clickCount:1});await wait(200);
  await key('Space',' ',32);await key('Space',' ',32,'keyUp');if(name!=='triple'){await key('KeyF','f',70);await key('KeyF','f',70,'keyUp');await key('Enter','Enter',13);await key('Enter','Enter',13,'keyUp');}
  await wait(9000);
  const data=await c.eval(`({scene:document.querySelector('#game').dataset.scene,phase:document.querySelector('#game').dataset.phase,quality:document.querySelector('#game').dataset.fx,fields:document.querySelector('#game').dataset.fields,fullscreen:document.fullscreenElement?.id,debug:document.querySelector('#debug').textContent,telemetry:document.querySelector('#telemetry').textContent,dimensions:[document.querySelector('#game').width,document.querySelector('#game').height],dpr:devicePixelRatio,userAgent:navigator.userAgent,cores:navigator.hardwareConcurrency})`);assert.equal(data.phase,'running');assert.equal(data.fullscreen,'game');assert.equal(data.fields,name==='triple'?'off,off':'on,on');
  report.cases.push({name,...data});await c.shot(evidencePath(`docs/endless-vfx/phase-e-live-${name}.png`));await key('ShiftLeft','Shift',16,'keyUp');await key('ShiftRight','Shift',16,'keyUp');await c.eval('document.exitFullscreen()');
 }report.errors=c.errors;assert.equal(c.errors.length,0);await fs.writeFile(evidencePath('docs/endless-vfx/phase-e-performance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{c.close();}
