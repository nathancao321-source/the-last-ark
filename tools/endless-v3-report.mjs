import fs from 'node:fs/promises';
import path from 'node:path';
import {connect} from './endless-qa/browser.mjs';
const folder='docs/endless-v3',read=async name=>JSON.parse(await fs.readFile(path.join(folder,name),'utf8'));
const inputs=await read('input-checks.json'),checks=await read('browser-checks.json'),cases=await read('interaction-cases.json'),flight=await read('flight-v3-20261017.json'),stability=await read('stability.json');
const perf=[];for(const seed of [20261017,7,424242])for(const version of [2,3]){const d=await read(`perf-v${version}-${seed}.json`);perf.push({seed,version,work:d.work,frameInterval:d.frameInterval,bodies:d.maxBodies,loaded:d.maxLoaded,cache:d.maxCache,wall:d.wall,elapsed:d.elapsed,errors:d.errors.length});}
const quantiles=values=>{const a=[...values].sort((a,b)=>a-b);return {count:a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)],max:a.at(-1)};};
const summary={baseline:{files:43,tests:585},current:{files:45,tests:601},perf,flight:{...flight,rawWork:undefined,rawFrames:undefined},native:{...cases.native,times:Object.fromEntries(Object.entries(cases.native.times).map(([k,v])=>[k,quantiles(v)]))},stability:{cases:stability.rows.length,events:stability.rows.reduce((n,r)=>n+r.events,0),budget:stability.rows.reduce((n,r)=>n+r.budget,0)},inputs,checks:checks.native,errors:checks.errors};
await fs.writeFile(path.join(folder,'summary.json'),JSON.stringify(summary,null,2));
const pictures=[];for(const seed of [20261017,7,424242])for(const version of [2,3])pictures.push({seed,version,data:(await fs.readFile(path.join(folder,`layout-v${version}-${seed}.png`))).toString('base64')});
const c=await connect();try{
 const png=await c.eval(`(async()=>{const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=1320;const ctx=canvas.getContext('2d');ctx.fillStyle='#060910';ctx.fillRect(0,0,1280,1320);let n=0;for(const p of ${JSON.stringify(pictures)}){const im=new Image();im.src='data:image/png;base64,'+p.data;await im.decode();const x=n%2*640,y=Math.floor(n/2)*440;ctx.drawImage(im,x,y+35,640,400);ctx.fillStyle='#fff';ctx.font='18px monospace';ctx.fillText('Seed '+p.seed+' | v'+p.version,x+15,y+25);n++;}return canvas.toDataURL('image/png').split(',')[1];})()`);
 await fs.writeFile(path.join(folder,'comparison-seeds.png'),Buffer.from(png,'base64'));
}finally{c.close();}
console.log(JSON.stringify({perf,native:summary.native,stability:summary.stability}));
