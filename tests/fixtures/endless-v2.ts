// Frozen regression fixture: legacy tests must continue checking the v2 world
// after the production new-world default advances. No old assertions removed.
import * as generator from '../../src/world/generator';
import {endlessLevel as base} from '../../src/levels/endless';
export * from '../../src/world/generator';
export const endlessLevel={...base,generatorVersion:2 as const};
export const generateChunk=(seed:number,key:Parameters<typeof generator.generateChunk>[1],version:generator.GeneratorVersion=2)=>generator.generateChunk(seed,key,version);
export const landmarks=(seed:number,version:generator.GeneratorVersion=2)=>generator.landmarks(seed,version);
export const landmarkPosition=(seed:number,kind:generator.DiscoveryKind,version:generator.GeneratorVersion=2)=>generator.landmarkPosition(seed,kind,version);
export const chunkFeatureCenter=(seed:number,key:Parameters<typeof generator.generateChunk>[1],version:generator.GeneratorVersion=2)=>generator.chunkFeatureCenter(seed,key,version);
