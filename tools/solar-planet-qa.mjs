import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {connect,setup,gameUrl} from './endless-qa/browser.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const folder=path.join(root,'docs','solar-system-visuals');
await fs.mkdir(folder,{recursive:true});
const mode=process.argv[2]??'before';
if(mode==='before'){
  try{await fs.access(path.join(folder,'before-planets.png'));throw Error('Baseline exists; use a separate checkout/output to avoid overwriting evidence.');}
  catch(error){if(error.code!=='ENOENT')throw error;}
}
const c=await connect();
try{
  await c.send('Emulation.setDeviceMetricsOverride',{width:1200,height:720,deviceScaleFactor:1,mobile:false});
  await c.send('Page.navigate',{url:gameUrl()});
  await new Promise(r=>setTimeout(r,1000));
  await c.eval(setup);
  const result=await c.eval(`(async()=>{
    const q=qa, names=['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune','pluto'];
    const zooms=[0.28,0.8,1.8];
    q.game=q.createGame(q.solarSystem);q.game.phase='paused';q.game.elapsed=18;q.game.message='';
    q.game.players.forEach(p=>p.position={x:-50000,y:-50000});
    const board=document.createElement('canvas');board.width=1620;board.height=zooms.length*360*3;
    const bctx=board.getContext('2d');bctx.fillStyle='#070b12';bctx.fillRect(0,0,board.width,board.height);
    const entries=[];
    for(let zi=0;zi<zooms.length;zi++)for(let i=0;i<names.length;i++){
      const body=q.game.bodies.find(b=>b.id===names[i]);if(!body)throw Error('Missing planet '+names[i]);
      const surface=document.createElement('canvas');surface.width=1200;surface.height=720;
      q.canvas=surface;q.ctx=surface.getContext('2d');q.camera=q.createCamera(body.position,1200,720);q.camera.zoom=zooms[zi];
      q.visuals=q.createVisualState(q.game.players);q.renderer??=q.createDemoRenderer();
      q.draw=(quality='high')=>q.render(q.ctx,q.game,{points:[],seconds:0,outcome:'horizon'},q.camera,{enhanced:true,visuals:q.visuals,renderer:q.renderer,warp:{...q.DEFAULT_WARP,quality},art:q.DEFAULT_ART});
      q.draw();await new Promise(r=>setTimeout(r,zi===0&&i===0?2200:140));q.draw();
      const x=(i%3)*540,y=(zi*3+Math.floor(i/3))*360;
      bctx.drawImage(surface,330,180,540,360,x,y,540,360);bctx.fillStyle='#edf3fb';bctx.font='600 15px system-ui';bctx.fillText(names[i].toUpperCase()+'  ·  zoom '+zooms[zi],x+12,y+23);
      entries.push({id:names[i],radius:body.radius,zoom:zooms[zi]});
    }
    q.camera=q.createCamera({x:3060,y:0},1200,720);q.camera.zoom=.8;q.draw();await new Promise(r=>setTimeout(r,300));q.draw();
    const scene=q.canvas.toDataURL('image/png').split(',')[1],before=JSON.stringify(q.game),timings=[];
    for(let i=0;i<100;i++){const start=performance.now();q.draw();timings.push(performance.now()-start);}
    timings.sort((a,b)=>a-b);q.draw('off');
    return {png:board.toDataURL('image/png').split(',')[1],scene,off:q.canvas.toDataURL('image/png').split(',')[1],entries,render:{p50:timings[50],p95:timings[95]},readOnly:before===JSON.stringify(q.game)};
  })()`);
  await fs.writeFile(path.join(folder,`${mode}-planets.png`),Buffer.from(result.png,'base64'));
  await fs.writeFile(path.join(folder,`${mode}-scene.png`),Buffer.from(result.scene,'base64'));
  await fs.writeFile(path.join(folder,`${mode}-off.png`),Buffer.from(result.off,'base64'));
  result.offHash=createHash('sha256').update(Buffer.from(result.off,'base64')).digest('hex');
  delete result.png;delete result.scene;delete result.off;result.errors=c.errors;
  await fs.writeFile(path.join(folder,`${mode}.json`),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{c.close();}
