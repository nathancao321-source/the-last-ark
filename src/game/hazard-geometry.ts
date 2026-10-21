import type {Vec2} from '../physics/vector';
import type {JetConfig,JetPhase,SolarWaveState} from './hazard-types';
export interface JetBeam {readonly start:Readonly<Vec2>;readonly end:Readonly<Vec2>;readonly direction:1|-1;readonly length:number;readonly visualLength:number;readonly coreRadius:number;readonly plumeRadius:number}
export interface JetGeometry {readonly origin:Readonly<Vec2>;readonly beams:readonly JetBeam[];readonly phase:JetPhase;readonly cycle:number;readonly progress:number;readonly flowAge:number;readonly intensity:number;readonly damaging:boolean}
/** The single definition of jet origin, axis, capsule and instant activation.
 * Simulation owns these snapshots. Collision and renderer consume them. */
export function jetGeometry(origin:Vec2,radius:number,config:JetConfig,clock:{phase:JetPhase;cycle:number;progress:number;flowAge?:number}):JetGeometry {
 const beams=([-1,1] as const).map(direction=>({direction,start:{x:origin.x,y:origin.y+direction*radius},end:{x:origin.x,y:origin.y+direction*(radius+config.length)},length:config.length,visualLength:config.length+Math.max(0,config.visualTail??0),coreRadius:config.coreRadius,plumeRadius:config.plumeRadius}));
 return {origin:{...origin},beams,...clock,flowAge:clock.flowAge??0,damaging:clock.phase==='firing',intensity:clock.phase==='firing'?1:clock.phase==='warning'?.12+.35*clock.progress:clock.phase==='dissipating'?.18*(1-clock.progress):0};
}
const smoothstep=(value:number)=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
/** Rendering-only envelope. Damage still reads `damaging` from the same snapshot. */
export function jetVisualIntensity(geometry:Pick<JetGeometry,'phase'|'progress'>):number {
 if(geometry.phase==='warning')return .56*smoothstep(geometry.progress);
 // Readable throughout damage, with matching intensities at both boundaries.
 if(geometry.phase==='firing')return .56+.44*smoothstep(geometry.progress/.22)*smoothstep((1-geometry.progress)/.22);
 if(geometry.phase==='dissipating')return .56*(1-smoothstep(geometry.progress));
 return 0;
}
/** Presentation only. Width/heat/density meet at phase boundaries; the full
 * collision width is always present for every damaging firing snapshot. */
export function jetVisualEnvelope(geometry:Pick<JetGeometry,'phase'|'progress'>) {
 const p=smoothstep(geometry.progress),firing=smoothstep(geometry.progress/.22)*smoothstep((1-geometry.progress)/.22);
 const width=geometry.phase==='warning'?.22+.78*p:geometry.phase==='dissipating'?1-.9*p:1;
 const heat=geometry.phase==='warning'?.65*p:geometry.phase==='firing'?.65+.35*firing:geometry.phase==='dissipating'?.65*(1-p):0;
 return {opacity:jetVisualIntensity(geometry),width,heat,density:.2+.8*heat};
}
export const JET_FADE_START=.45;
export function jetSpatialFade(distance:number,length:number,fadeStart=JET_FADE_START,terminal=0):number {
 const u=Math.max(0,Math.min(1,distance/Math.max(1,length)));
 // `length` is the full visible extent. The lethal capsule ends earlier,
 // while this function is still bright; only the harmless tail reaches zero.
 return terminal+(1-terminal)*(1-smoothstep((u-fadeStart)/Math.max(.001,1-fadeStart)));
}
export function shockwaveRadius(wave:SolarWaveState,time:number):number {return wave.radius0+wave.speed*Math.max(0,Math.min(time,wave.endsAt)-wave.launchedAt);}
export function waveGeometry(wave:SolarWaveState){return {origin:wave.origin,outer:wave.front,inner:Math.max(0,wave.front-wave.thickness),center:Math.max(0,wave.front-wave.thickness*.5),thickness:wave.thickness,damaging:wave.active} as const;}
/** Decorative flow starts at the physical pole and has zero lateral offset there. */
export function jetParticle(beam:JetBeam,index:number,age:number,visual=false):Vec2 {
 const extent=visual?beam.visualLength:beam.length;
 const distance=((Math.max(0,age)*580-index*extent/48)%extent+extent)%extent;
 const sway=Math.sin(index*13.7+distance*.013)*beam.coreRadius*.35*Math.min(1,distance/80);
 return {x:beam.start.x+sway,y:beam.start.y+beam.direction*distance};
}
