import { generateNebula,generateStars } from './texture';
import type { ArtConfig } from './art';
const scope=self as unknown as {onmessage:(event:MessageEvent<ArtConfig>)=>void;postMessage:(message:unknown,transfer:Transferable[])=>void};
scope.onmessage=(event:MessageEvent<ArtConfig>)=>{
  const start=performance.now(),pixels=generateNebula(event.data),stars=generateStars();
  scope.postMessage({pixels,stars,ms:performance.now()-start},[pixels.buffer as ArrayBuffer,stars.buffer as ArrayBuffer]);
};
