import type { Vec2 } from '../physics/vector';

export interface SolarWaveConfig {
  sourceId: string; exitId: string; launchAt: number; warningSeconds: number;
  shockwaveTravelTime: number; thickness: number; duration: number;
}
export interface JetConfig {
  sourceId: string; length: number; coreRadius: number; plumeRadius: number;
  idle: number; warning: number; firing: number; dissipating: number; cooldown: number;
  invulnerability: number;
}
export type JetPhase = 'idle' | 'warning' | 'firing' | 'dissipating' | 'cooldown';
export interface SolarWaveState {
  origin: Vec2; radius0: number; speed: number; launchedAt: number;
  front: number; active: boolean; targetDistance: number; thickness:number; endsAt:number; travelTime:number;
}
export interface HazardState {
  wave?: SolarWaveState;
  jet?: { phase: JetPhase; cycle: number; progress: number; exposed: boolean; protectedUntil: number; geometry?:import('./hazard-geometry').JetGeometry };
  impactUntil?: number;
  configurationError?: string;
}
/** Actual integration chords, including collision TOIs; times are relative to the step. */
export interface MotionChord { from: Vec2; to: Vec2; start: number; end: number }
