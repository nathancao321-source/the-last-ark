import { sub } from './vector';
import type { Vec2 } from './vector';
export interface CircleContact { time:number; normal:Vec2; penetration:number }
/** First relative-motion contact in normalized [0,1] time. Normal points A -> B.
 * Initial overlap and coincident centers are deterministic, with no division by zero. */
export function sweptCircle(a0:Vec2,a1:Vec2,b0:Vec2,b1:Vec2,radius:number):CircleContact|undefined {
  const p=sub(b0,a0),v=sub(sub(b1,b0),sub(a1,a0));
  const distance=Math.hypot(p.x,p.y),c=distance*distance-radius*radius;
  let time=0;
  if(c>1e-8) {
    const a=v.x*v.x+v.y*v.y,b=2*(p.x*v.x+p.y*v.y),discriminant=b*b-4*a*c;
    if(a<1e-16||b>=0||discriminant<0)return;
    time=(-b-Math.sqrt(Math.max(0,discriminant)))/(2*a);
    if(time<0||time>1)return;
  }
  const hit={x:p.x+v.x*time,y:p.y+v.y*time},n=Math.hypot(hit.x,hit.y),speed=Math.hypot(v.x,v.y);
  const normal=n>1e-9?{x:hit.x/n,y:hit.y/n}:speed>1e-9?{x:-v.x/speed,y:-v.y/speed}:{x:1,y:0};
  return {time,normal,penetration:Math.max(0,radius-distance)};
}
/** Swept circle collision in relative coordinates, including initial overlap. */
export function sweptOverlap(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2, radius: number): boolean {
  const start = sub(a0, b0);
  const end = sub(a1, b1);
  const d = sub(end, start);
  const n = d.x * d.x + d.y * d.y;
  const t = n === 0 ? 0 : Math.max(0, Math.min(1, -(start.x * d.x + start.y * d.y) / n));
  return Math.hypot(start.x + t * d.x, start.y + t * d.y) <= radius;
}
