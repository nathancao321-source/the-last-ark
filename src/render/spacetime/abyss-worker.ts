import {generateAbyssTile} from './abyss-material';
import type {AbyssTileRequest} from './abyss-material';
const scope=self as unknown as {onmessage:(event:MessageEvent<AbyssTileRequest>)=>void;postMessage:(message:unknown,transfer:Transferable[])=>void};
scope.onmessage=({data})=>{const start=performance.now(),pixels=generateAbyssTile(data);scope.postMessage({key:data.key,pixels,ms:performance.now()-start},[pixels.buffer as ArrayBuffer]);};
