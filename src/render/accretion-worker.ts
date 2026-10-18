import {bakeAccretion} from './accretion-model';
self.onmessage=()=>{const bake=bakeAccretion();self.postMessage(bake,{transfer:[bake.material.buffer,...bake.layers.flatMap(l=>[l.indices.buffer,l.angles.buffer,l.rows.buffer,l.coverage.buffer])]});};
