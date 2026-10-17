import type { Body } from '../game/types';
import { capabilities } from '../game/entities';
export type ContactPolicy='ignore'|'bounce'|'ship-fail'|'absorb-a'|'absorb-b'|'merge'|'large-fail';
export const contactRadius=(b:Body)=>capabilities(b).collision==='capture'?(b.captureRadius??b.radius):b.radius;
export function collisionMass(b:Body):number {return Math.max(1e-6,b.contact?.mass??(b.radius**3*capabilities(b).density));}
export function hasCollider(b:Body):boolean {
  // Legacy station data is also trigger-only; all new goals use wormhole.
  return b.layer!=='background'&&b.layer!=='hidden'&&!b.spawnPending&&b.kind!=='wormhole'&&b.kind!=='station'
    &&(b.kind==='ship'||capabilities(b).collision!=='none');
}
export function contactPolicy(a:Body,b:Body):ContactPolicy {
  if(!hasCollider(a)||!hasCollider(b))return 'ignore';
  const ac=capabilities(a).collision==='capture',bc=capabilities(b).collision==='capture';
  if(ac||bc) {
    if(ac&&bc)return 'ignore';
    if(a.kind==='ship'||b.kind==='ship')return 'ship-fail';
    return ac?'absorb-b':'absorb-a';
  }
  const ship=a.kind==='ship'?a:b.kind==='ship'?b:undefined;
  if(ship) {
    if(a.kind===b.kind)return 'ignore';
    return 'ship-fail';
  }
  if(a.kind==='asteroid'&&b.kind==='asteroid')return 'bounce';
  if(a.kind==='asteroid')return 'absorb-a';
  if(b.kind==='asteroid')return 'absorb-b';
  if(a.contact?.largeBody==='fail'||b.contact?.largeBody==='fail')return 'large-fail';
  if(a.contact?.largeBody==='merge'||b.contact?.largeBody==='merge')return 'merge';
  return collisionMass(a)<collisionMass(b)?'absorb-a':'absorb-b';
}
