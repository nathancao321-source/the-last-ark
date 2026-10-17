import type { Field, Player, Phase } from '../../game/types';
import type { Vec2 } from '../../physics/vector';
import { fieldAcceleration } from '../../physics/fields';
import { seededRandom } from '../../world/sectors';
import { enabled } from './config';
import type { WarpConfig } from './config';

export interface Source { id:string; position:Vec2; field:Field; weight:number; active:boolean; motion:number; cooldown:number; table:Float32Array; phase:number }
export interface Ripple { alive:boolean; origin:Vec2; direction:Vec2; polarity:number; radius:number; age:number; decay:number; speed:number; amplitude:number; phase:number }
export interface VisualState { time:number; revision:number; sources:Source[]; events:Ripple[]; emitted:number; invalid:number }
export interface Sample { dx:number; dy:number; luminance:number }
const smooth=(t:number)=>{const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x);};
const envelope=(r:number,R:number)=>{const t=Math.max(0,1-(r/R)**2);return t*t;};
/** The only force adapter: build a radial lookup by calling the existing field
 * function, never copying its inverse-square law. Allocations occur at reset only.
 * Runtime interpolation preserves radial direction, polarity and finite support. */
export function buildForceTable(field:Field):Float32Array {
  const table=new Float32Array(1025),origin={x:0,y:0},point={x:0,y:0};
  if(!(field.radius>0))return table;
  for(let i=1;i<table.length;i++) {point.x=i/1024*field.radius;table[i]=Math.abs(fieldAcceleration(point,origin,field).x);}
  return table;
}
export function lookupForce(s:Source,distance:number):number {
  if(distance>=s.field.radius||distance<=0||s.field.radius<=0)return 0;
  const t=distance/s.field.radius*1024,i=Math.floor(t);return s.table[i]+(s.table[i+1]-s.table[i])*(t-i);
}
export function createVisualState(players:readonly Player[],revision=0):VisualState {
  const random=seededRandom(87122);
  return {time:0,revision,emitted:0,invalid:0,sources:players.slice(0,2).map(p=>({id:p.id,position:{...p.position},field:{...p.field},
    weight:0,active:false,motion:0,cooldown:0,table:buildForceTable(p.field),phase:random()*Math.PI*2})),
    events:Array.from({length:4},()=>({alive:false,origin:{x:0,y:0},direction:{x:0,y:0},polarity:1,radius:0,age:0,decay:1,speed:240,amplitude:0,phase:0}))};
}
function emit(state:VisualState,s:Source,p:Player,c:WarpConfig,amplitude:number):void {
  const e=state.events.find(event=>!event.alive);if(!e)return;
  const speed=Math.hypot(p.velocity.x,p.velocity.y);
  e.alive=true;e.origin.x=p.position.x;e.origin.y=p.position.y;e.direction.x=p.velocity.x/Math.max(1,speed);e.direction.y=p.velocity.y/Math.max(1,speed);
  e.polarity=s.field.polarity;e.radius=s.field.radius;e.age=0;e.decay=c.decay;e.speed=c.propagation;e.amplitude=amplitude;e.phase=s.phase;
  s.cooldown=0.18;state.emitted++;
}
/** Read-only bridge. Demo fields have fixed identity/polarity/configuration; only
 * activation and motion vary. Reset on revision instead of treating teleport as motion. */
export function updateVisuals(state:VisualState,players:readonly Player[],phase:Phase,revision:number,dt:number,c:WarpConfig):void {
  if(revision!==state.revision)Object.assign(state,createVisualState(players,revision));
  if(phase!=='running'||!Number.isFinite(dt)||dt<=0)return;
  dt=Math.min(dt,0.1);state.time+=dt;
  for(const e of state.events)if(e.alive){e.age+=dt;if(e.age>=4*e.decay)e.alive=false;}
  for(let i=0;i<state.sources.length;i++) {
    const s=state.sources[i],p=players[i];
    if(!p||!(p.field.radius>0)||!Number.isFinite(p.position.x+p.position.y)){state.invalid++;continue;}
    s.position.x=p.position.x;s.position.y=p.position.y;
    s.weight+=(Number(p.active)-s.weight)*(1-Math.exp(-dt/(p.active?0.12:0.35)));
    s.cooldown=Math.max(0,s.cooldown-dt);
    s.motion=p.active?Math.min(1,s.motion+Math.max(0,Math.hypot(p.velocity.x,p.velocity.y)-60)*dt/90):0;
    const activation=p.active&&!s.active;
    if(enabled(c)&&c.interaction&&p.active&&s.cooldown===0&&(activation||s.motion>=1)) {
      emit(state,s,p,c,activation?1:0.55);s.motion=0;
    }
    s.active=p.active;
  }
}
/** Broad, deterministic crossed folds, not radial bands. No RNG in the hot path. */
function texture(x:number,y:number,phase:number,scale:number):number {
  const a=(x*0.83+y*0.56)/scale*Math.PI*2;
  const b=(-x*0.32+y*0.95)/scale*Math.PI*2;
  return 0.56*Math.sin(a+0.7*Math.sin(b*0.57+phase))+0.28*Math.cos(b+phase)+0.16*Math.sin(a*0.43-b*0.61);
}
/** One shared sample produces both background displacement and luminance.
 * Unwarped WORLD points in; CSS displacement out. No physical state is written. */
export function sampleDisturbance(out:Sample,x:number,y:number,state:VisualState,c:WarpConfig,zoom:number,spatialScale=192):Sample {
  out.dx=0;out.dy=0;out.luminance=0;if(!enabled(c))return out;
  let ax=0,ay=0,core=1,brightness=0,ex=0,ey=0;
  for(const s of state.sources) {
    if(s.weight<1e-8||s.field.radius<=0)continue;
    const rx=x-s.position.x,ry=y-s.position.y,r=Math.hypot(rx,ry),R=s.field.radius,w=envelope(r,R);
    if(w===0)continue;
    const soft=Math.sqrt(r*r+(R*0.04)**2),transition=r/Math.max(1e-9,Math.sqrt(r*r+((1-s.weight)*R*0.04)**2));
    const strength=lookupForce(s,r)*s.weight*transition,dir=-s.field.polarity/Math.max(r,1e-9);
    ax+=rx*dir*strength;ay+=ry*dir*strength;core*=1-w*s.weight*(1-r/soft);
    const n=texture(rx-rx*dir*strength*0.32,ry-ry*dir*strength*0.32,s.phase,spatialScale);
    // A signed folded surface with a dark/bright bias, not a filled tint disc.
    // Dark troughs have pale shoulders: contrast describes the folded surface,
    // while the bias communicates compression versus expansion. All channels
    // still consume the same force, event envelope and world-anchored texture.
    brightness+=strength/Math.sqrt(3600+strength*strength)*w*(0.13*n+(s.field.polarity===1?-0.024:0.022));
    const idle=c.idle*s.weight*w*(Math.sin(state.time*2*Math.PI/23+rx/110+s.phase)*0.6+Math.sin(state.time*2*Math.PI/37+ry/97)*0.4);
    brightness+=idle;ex+=idle*45*rx/soft;ey+=idle*45*ry/soft;
  }
  brightness*=core;
  const base=22*core/Math.sqrt(3600+ax*ax+ay*ay);
  if(c.interaction)for(const e of state.events)if(e.alive) {
    const rx=x-e.origin.x,ry=y-e.origin.y,r=Math.hypot(rx,ry),w=envelope(r,e.radius);if(w===0)continue;
    const soft=Math.sqrt(r*r+(e.radius*0.04)**2),q=(soft-e.radius*0.04-e.speed*e.age)/spatialScale+0.35*texture(rx,ry,e.phase,spatialScale);
    const temporal=smooth(e.age/0.09)*Math.exp(-e.age/e.decay)*(1-smooth((e.age-3.75*e.decay)/(0.25*e.decay)));
    const H=e.amplitude*temporal*w*(1+0.4*texture(rx,ry,e.phase,spatialScale))*(1-q*q)*Math.exp(-q*q/2);
    ex+=3*H*(-e.polarity*rx/soft+0.15*e.direction.x);ey+=3*H*(-e.polarity*ry/soft+0.15*e.direction.y);
    brightness+=-e.polarity*H*0.025;
  }
  const dx=ax*base+ex,dy=ay*base+ey,cap=Math.min(c.maxDisplacement,0.08*280*zoom);
  const limit=cap>0?1/Math.sqrt(1+(dx*dx+dy*dy)/(cap*cap)):0;
  if(c.starWarp&&cap>0){out.dx=dx*limit;out.dy=dy*limit;}
  const b=brightness*c.folds,max=b<0?0.1:0.06;
  if(c.luminance&&c.folds>0)out.luminance=max*Math.tanh(b/max);
  return out;
}
