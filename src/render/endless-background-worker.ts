import {generateEndlessTile} from './endless-field';
import type {GeneratorVersion} from '../world/generator';
self.onmessage=(event:MessageEvent<{seed:number;generatorVersion?:GeneratorVersion;tx:number;ty:number;span:number;res:number;key:string}>)=>{
 const p=event.data,t=performance.now(),tile=generateEndlessTile(p.seed,p.tx,p.ty,p.span,p.res,p.generatorVersion);
 self.postMessage({...p,...tile,ms:performance.now()-t},{transfer:[tile.pixels.buffer,tile.activity.buffer,tile.activity2.buffer]});
};
