import {celestialPixels} from './celestial-texture';
import type {CelestialTexture} from './celestial-texture';
self.onmessage=(event:MessageEvent<{kind:CelestialTexture;width:number;height:number}>)=>{const {kind,width,height}=event.data,start=performance.now(),pixels=celestialPixels(kind,width,height);self.postMessage({kind,width,height,pixels,ms:performance.now()-start},{transfer:[pixels.buffer]});};
