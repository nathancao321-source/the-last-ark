import type { Body, Orbit } from '../game/types';
import { add, sub, scale, length } from './vector';
/** Prescribed circular baseline plus integrated player perturbation. This is not N-body astronomy. */
export function sampleOrbit(orbit: Orbit, time: number) {
  const angle = orbit.phase + orbit.angularSpeed * time;
  return { position: { x: orbit.center.x + Math.cos(angle)*orbit.radius, y: orbit.center.y + Math.sin(angle)*orbit.radius },
    velocity: { x: -Math.sin(angle)*orbit.radius*orbit.angularSpeed, y: Math.cos(angle)*orbit.radius*orbit.angularSpeed } };
}
export function drift(body: Body, dt: number): void {
  if (!body.orbit) { body.position=add(body.position,scale(body.velocity,dt)); return; }
  const time=body.orbitTime ?? 0, before=sampleOrbit(body.orbit,time), after=sampleOrbit(body.orbit,time+dt);
  const disturbance=sub(body.velocity,before.velocity);
  body.position=add(body.position,add(sub(after.position,before.position),scale(disturbance,dt)));
  body.velocity=add(after.velocity,disturbance); body.orbitTime=time+dt;
}
/** Bounded drift constraint: remove only outward velocity at the boundary, never snap to spawn. */
export function constrainDisplacement(body: Body): void {
  const baseline=body.orbit ? sampleOrbit(body.orbit,body.orbitTime ?? 0) : undefined;
  const center=baseline?.position ?? body.displacementLimit?.center;
  const radius=body.orbit?.maxDrift ?? body.displacementLimit?.radius;
  if (!center || radius===undefined) return;
  const delta=sub(body.position,center), distance=length(delta);
  if (distance<=radius) return;
  const normal=scale(delta,1/distance);body.position=add(center,scale(normal,radius));
  const relative=sub(body.velocity,baseline?.velocity ?? {x:0,y:0});
  const outward=relative.x*normal.x+relative.y*normal.y;
  if(outward>0)body.velocity=sub(body.velocity,scale(normal,outward));
  if(body.stabilizationState) {
    const v=body.stabilizationState.playerVelocity, speed=v.x*normal.x+v.y*normal.y;
    if(speed>0)body.stabilizationState.playerVelocity=sub(v,scale(normal,speed));
  }
}
