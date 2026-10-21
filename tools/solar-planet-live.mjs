import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {connect} from './endless-qa/browser.mjs';
const folder=fileURLToPath(new URL('../docs/solar-system-visuals/',import.meta.url));
const c=await connect(),report={cases:[],errors:[]};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function key(code,key,vk){for(const type of ['keyDown','keyUp'])await c.send('Input.dispatchKeyEvent',{type,code,key,windowsVirtualKeyCode:vk});}
try{
  await c.send('Emulation.setDeviceMetricsOverride',{width:1200,height:720,deviceScaleFactor:1,mobile:false});
  for(const section of ['earth','belt']){
    const url=new URL(process.env.ARK_URL||'http://127.0.0.1:5177/');url.search='?dev=1&scene=solar_system&section='+section+'&fx=high';
    await c.send('Page.navigate',{url:url.href});await c.send('Page.bringToFront');await wait(1200);
    await c.send('Emulation.setDeviceMetricsOverride',{width:1200,height:720,deviceScaleFactor:1,mobile:false});
    await c.eval(`document.querySelector('#game').scrollIntoView({block:'center'});document.querySelector('#game').focus()`);
    await key('Space',' ',32);await wait(4200);
    const data=await c.eval(`({scene:document.querySelector('#game').dataset.scene,phase:document.querySelector('#game').dataset.phase,fullscreen:document.fullscreenElement?.id,
      telemetry:document.querySelector('#telemetry').textContent,debug:document.querySelector('#debug').textContent,dimensions:[document.querySelector('#game').width,document.querySelector('#game').height]})`);
    assert.equal(data.scene,'solar_system');assert.equal(data.phase,'running');
    await c.shot(folder+'live-'+section+'.png');await key('Space',' ',32);await wait(150);
    assert.equal(await c.eval(`document.querySelector('#game').dataset.phase`),'paused');
    report.cases.push({section,...data});
  }
  assert.equal(c.errors.length,0);report.errors=c.errors;await fs.writeFile(folder+'live.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{c.close();}
