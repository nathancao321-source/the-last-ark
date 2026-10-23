import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {connect} from './endless-qa/browser.mjs';
const c=await connect(),wait=ms=>new Promise(r=>setTimeout(r,ms));
const key=async(code,key,shift=false)=>{for(const type of ['keyDown','keyUp'])await c.send('Input.dispatchKeyEvent',{type,code,key,modifiers:shift?8:0,windowsVirtualKeyCode:code==='Space'?32:code==='ArrowRight'?39:code.charCodeAt(3)});};
try{
 await c.send('Page.navigate',{url:(process.env.ARK_URL||'http://127.0.0.1:5184/')+'?dev=1&scene=endless&generator=3&fx=medium'});await wait(1000);
 await c.eval("document.querySelector('#open-settings').click();var s=document.querySelector('#p1-device');s.value='mouse';s.dispatchEvent(new Event('change'));document.querySelector('#settings-done').click();document.querySelector('#game').focus()");await wait(200);await key('Space',' ');
 const before=await c.eval('structuredClone(__arkDev.scenes.game.players[0].position)'),box=await c.eval("(()=>{const r=document.querySelector('#game').getBoundingClientRect();return {x:r.x+r.width*.8,y:r.y+r.height*.4};})()");
 await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:box.x,y:box.y});for(const type of ['mousePressed','mouseReleased'])await c.send('Input.dispatchMouseEvent',{type,x:box.x,y:box.y,button:'left',clickCount:1});await wait(500);
 const mouse=await c.eval('({position:__arkDev.scenes.game.players[0].position,active:__arkDev.scenes.game.players[0].active,status:document.querySelector("#p1-device-status").textContent})');assert.ok(mouse.active);assert.ok(Math.hypot(mouse.position.x-before.x,mouse.position.y-before.y)>10);
 for(const type of ['mousePressed','mouseReleased'])await c.send('Input.dispatchMouseEvent',{type,x:box.x,y:box.y,button:'right',clickCount:1});await wait(200);const braking=await c.eval('document.querySelector("#p1-device-status").textContent');assert.match(braking,/已制动/);
 await key('KeyM','m');await wait(100);assert.equal(await c.eval('document.querySelector("#game").dataset.map'),'true');await key('KeyM','m');
 await key('Space',' ');await key('KeyK','k');await wait(250);const saved=await c.eval('({id:__arkDev.scenes.game.universe.cold.id,t:__arkDev.scenes.game.elapsed})');await key('KeyR','r');await wait(100);const fresh=await c.eval('__arkDev.scenes.game.universe.cold.id');assert.notEqual(fresh,saved.id);await key('KeyR','R',true);await wait(300);const restored=await c.eval('({id:__arkDev.scenes.game.universe.cold.id,t:__arkDev.scenes.game.elapsed,phase:__arkDev.scenes.game.phase})');assert.equal(restored.id,saved.id);assert.equal(restored.t,saved.t);assert.equal(restored.phase,'paused');
 await c.eval("document.querySelector('#open-settings').click();var s=document.querySelector('#p1-device');s.value='xbox0';s.dispatchEvent(new Event('change'));");await wait(100);const pad=await c.eval('document.querySelector("#p1-device-status").textContent');assert.match(pad,/未连接|未检测|连接/);
 await c.eval("var s=document.querySelector('#p1-device');s.value='keyboard';s.dispatchEvent(new Event('change'));document.querySelector('#settings-done').click()");
 const result={mouse,braking,map:true,retry:{saved,fresh,restored},disconnectedPadStatus:pad,physicalPadTested:false,errors:c.errors};await fs.writeFile('docs/endless-v3/input-checks.json',JSON.stringify(result,null,2));assert.equal(c.errors.length,0);console.log(JSON.stringify({mouse:true,brake:true,map:true,retry:true,padEntry:pad,errors:c.errors.length}));
}finally{c.close();}
