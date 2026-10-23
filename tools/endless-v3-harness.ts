// One statically linked browser QA entry. Importing individual source modules
// dynamically after Vite HMR can create distinct WeakMap runtime instances.
import * as game from '../src/game/game';
import * as runtime from '../src/world/endless-runtime';
import * as universe from '../src/world/universe';
import * as generator from '../src/world/generator';
import * as storage from '../src/world/cold-store';
import * as saving from '../src/game/exploration-v3';
import {endlessLevel} from '../src/levels/endless';
export {game,runtime,universe,generator,storage,saving,endlessLevel};
