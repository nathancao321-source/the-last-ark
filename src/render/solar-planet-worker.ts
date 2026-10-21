import {solarPlanetPixels} from './solar-planet-material';
import type {SolarPlanet,PlanetSize} from './solar-planet-material';
self.onmessage=(event:MessageEvent<{id:SolarPlanet;size:PlanetSize}>)=>{
  const {id,size}=event.data,start=performance.now(),pixels=solarPlanetPixels(id,size);
  const transfer=[pixels.surface.buffer];if(pixels.weather)transfer.push(pixels.weather.buffer);
  self.postMessage({id,size,...pixels,ms:performance.now()-start},{transfer});
};
