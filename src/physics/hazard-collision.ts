import type { Vec2 } from './vector';

function roots(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < 1e-12) return Math.abs(b) < 1e-12 ? [] : [-c / b];
  const d = b*b - 4*a*c;
  if (d < -1e-9) return [];
  const q = -.5 * (b + (b >= 0 ? 1 : -1) * Math.sqrt(Math.max(0,d)));
  return Math.abs(q) < 1e-15 ? [-b/(2*a)] : [q/a,c/q];
}
export function interpolate(a: Vec2, b: Vec2, t: number): Vec2 {
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
}
/** Exact linear-chord vs linearly expanding annulus. The front is the OUTER
 * edge; the band trails it. Partition at every boundary root, not endpoint sampling. */
export function expandingRingContact(from: Vec2, to: Vec2, origin: Vec2, front0: number, front1: number, thickness: number, shipRadius: number): boolean {
  const x=from.x-origin.x,y=from.y-origin.y,dx=to.x-from.x,dy=to.y-from.y,dr=front1-front0;
  const candidates=[0,1];
  for(const offset of [shipRadius,-thickness-shipRadius]) {
    const r=front0+offset;
    candidates.push(...roots(dx*dx+dy*dy-dr*dr,2*(x*dx+y*dy-r*dr),x*x+y*y-r*r).filter(t=>t>=0&&t<=1));
  }
  candidates.sort((a,b)=>a-b);
  const inside=(t:number)=>{const distance=Math.hypot(x+dx*t,y+dy*t),front=front0+dr*t;
    return distance<=front+shipRadius+1e-7 && distance>=Math.max(0,front-thickness-shipRadius)-1e-7;};
  return candidates.some((t,i)=>inside(t)||(i>0&&inside((t+candidates[i-1])/2)));
}
/** Moving circle vs vertical finite capsule, in world space. Returns the exact
 * entry/exit interval (convex shape), including rounded ends and tangencies. */
export function capsuleExposure(from:Vec2,to:Vec2,x:number,y0:number,y1:number,r:number): [number,number] | undefined {
  const dx=to.x-from.x,dy=to.y-from.y,lo=Math.min(y0,y1),hi=Math.max(y0,y1),cuts=[0,1];
  if(Math.abs(dx)>1e-12)cuts.push((x-r-from.x)/dx,(x+r-from.x)/dx);
  if(Math.abs(dy)>1e-12)cuts.push((lo-from.y)/dy,(hi-from.y)/dy);
  for(const y of [lo,hi])cuts.push(...roots(dx*dx+dy*dy,2*((from.x-x)*dx+(from.y-y)*dy),(from.x-x)**2+(from.y-y)**2-r*r));
  const sorted=cuts.filter(t=>t>=0&&t<=1).sort((a,b)=>a-b);
  const inside=(t:number)=>{const p=interpolate(from,to,t);return (p.x-x)**2+(p.y-Math.max(lo,Math.min(hi,p.y)))**2<=r*r+1e-7;};
  const hits=sorted.filter(inside);
  for(let i=1;i<sorted.length;i++)if(inside((sorted[i-1]+sorted[i])/2))hits.push(sorted[i-1],sorted[i]);
  return hits.length ? [Math.min(...hits),Math.max(...hits)] : undefined;
}
