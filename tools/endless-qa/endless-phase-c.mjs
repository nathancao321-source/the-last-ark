import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {start,warm,shot} from './endless-fixture.mjs';
import {evidencePath} from './browser.mjs';
const c=await start(),report={frames:[],errors:[]};try{
 await c.eval('qa.make(7168,1024)');await warm(c);
 for(const seconds of [0,20,60]){if(seconds)await c.eval(`qa.advance(${seconds===20?20:40})`);await c.eval('qa.paint()');await shot(c,`docs/endless-vfx/phase-c-triple-${seconds}s.png`);
 const state=await c.eval(`({elapsed:qa.game.elapsed,phase:qa.game.phase,stars:qa.game.bodies.filter(b=>b.kind==='star'&&b.id.startsWith('3,0/')).map(b=>({id:b.id,position:b.position,velocity:b.velocity,temperature:qa.stellar.sampleEndlessStar(b,qa.game.elapsed).temperature})),cache:qa.stellar.endlessStellarCacheStats()})`);assert.equal(state.phase,'running');assert.equal(state.stars.length,3);assert.ok(Math.abs(state.elapsed-seconds)<1e-6);report.frames.push(state);}
 assert.notDeepEqual(report.frames[0].stars.map(s=>s.position),report.frames[2].stars.map(s=>s.position));assert.equal(new Set(report.frames[0].stars.map(s=>s.temperature)).size,3);
 const immutable=await c.eval('(()=>{const before=JSON.stringify(qa.game);qa.paint();return before===JSON.stringify(qa.game);})()');assert.ok(immutable);report.readonly=immutable;report.errors=c.errors;assert.equal(c.errors.length,0);await fs.writeFile(evidencePath('docs/endless-vfx/phase-c.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{c.close();}
