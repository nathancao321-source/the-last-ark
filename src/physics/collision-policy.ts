import type { Body } from '../game/types';
import { capabilities } from '../game/entities';
import { length } from './vector';
export type ContactPolicy='ignore'|'bounce'|'dock-bounce'|'ship-fail'|'absorb-a'|'absorb-b'|'merge'|'large-fail';
export const contactRadius=(b:Body)=>capabilities(b).collision==='capture'?(b.captureRadius??b.radius):b.radius;
export function collisionMass(b:Body):number {return Math.max(1e-6,b.contact?.mass??(b.radius**3*capabilities(b).density));}
export function hasCollider(b:Body):boolean {
  return b.layer!=='background'&&b.layer!=='hidden'&&!b.spawnPending&&b.kind!=='wormhole'
    &&(b.kind==='ship'||(b.collision!=='none'&&(b.kind==='station'||capabilities(b).collision!=='none')));
}
/** Docking limits supplied by the mission layer. No names or screen coordinates. */
export function contactPolicy(a:Body,b:Body,docks:ReadonlyMap<string,number>):ContactPolicy {
  if(!hasCollider(a)||!hasCollider(b))return 'ignore';
  const ac=capabilities(a).collision==='capture',bc=capabilities(b).collision==='capture';
  if(ac||bc) {
    if(ac&&bc)return 'ignore';
    if(a.kind==='ship'||b.kind==='ship')return 'ship-fail';
    return ac?'absorb-b':'absorb-a';
  }
  const ship=a.kind==='ship'?a:b.kind==='ship'?b:undefined;
  if(ship) {
    const other=ship===a?b:a;
    if(other.kind==='ship')return 'ignore';
    if(other.kind==='station')return length(ship.velocity)<= (docks.get(other.id)??other.contact?.dockingSpeed??48)?'ignore':'dock-bounce';
    return 'ship-fail';
  }
  if(a.kind==='station'||b.kind==='station')return 'ignore';
  if(a.kind==='asteroid'&&b.kind==='asteroid')return 'bounce';
  if(a.kind==='asteroid')return 'absorb-a';
  if(b.kind==='asteroid')return 'absorb-b';
  if(a.contact?.largeBody==='fail'||b.contact?.largeBody==='fail')return 'large-fail';
  if(a.contact?.largeBody==='merge'||b.contact?.largeBody==='merge')return 'merge';
  return collisionMass(a)<collisionMass(b)?'absorb-a':'absorb-b';
}
