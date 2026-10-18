import {generateEndlessTile} from './endless-field';
self.onmessage=(event:MessageEvent<{seed:number;tx:number;ty:number;span:number;res:number;key:string}>)=>{
 const p=event.data,t=performance.now(),tile=generateEndlessTile(p.seed,p.tx,p.ty,p.span,p.res);
 self.postMessage({...p,...tile,ms:performance.now()-t},{transfer:[tile.pixels.buffer,tile.activity.buffer]});
};
