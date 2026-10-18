import type { Field, Player, Phase } from '../../game/types';
import type { Vec2 } from '../../physics/vector';
import { fieldAcceleration } from '../../physics/fields';
import { seededRandom } from '../../world/sectors';
import { worldFabric } from './noise';
import { enabled } from './config';
import type { WarpConfig } from './config';
import type {CelestialEvents} from '../celestial-events';

export interface Source { id:string; position:Vec2; field:Field; weight:number; active:boolean; motion:number; cooldown:number; table:Float32Array; phase:number;nodeClock:number;history:Float64Array;historyIndex:number;historyTime:number }
export interface Ripple { alive:boolean; origin:Vec2; direction:Vec2; polarity:number; radius:number; age:number; decay:number; speed:number; amplitude:number; phase:number }
export interface VisualState { time:number; revision:number; sources:Source[]; events:Ripple[]; emitted:number; invalid:number;
  worldOrigin?:Vec2;
  hazardWave?: {origin:Vec2;front:number;thickness:number};
  portals?: {origin:Vec2;radius:number;approach:number}[];celestial?:CelestialEvents; }
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
  return {time:0,revision,emitted:0,invalid:0,portals:undefined,celestial:undefined,hazardWave:undefined,sources:players.slice(0,2).map(p=>({id:p.id,position:{...p.position},field:{...p.field},
    weight:0,active:false,motion:0,cooldown:0,table:buildForceTable(p.field),phase:random()*Math.PI*2,nodeClock:0,history:Float64Array.from(Array.from({length:16},(_,i)=>i%2?p.position.y:p.position.x)),historyIndex:0,historyTime:0})),
    events:Array.from({length:4},()=>({alive:false,origin:{x:0,y:0},direction:{x:0,y:0},polarity:1,radius:0,age:0,decay:1,speed:240,amplitude:0,phase:0}))};
}
/** Keep world anchors in sync while the game is paused or ready. This does not
 * advance visual time, emit events, or change field weights; it only mirrors
 * the real player transforms so a paused manual reposition cannot detach the
 * read-only backdrop from its node. */
export function syncVisualPositions(state:VisualState,players:readonly Player[],revision:number):void {
  if(revision!==state.revision){Object.assign(state,createVisualState(players,revision));return;}
  for(let i=0;i<state.sources.length&&i<players.length;i++){
    const s=state.sources[i],p=players[i];s.position.x=p.position.x;s.position.y=p.position.y;s.active=p.active;
    if(s.field.radius!==p.field.radius||s.field.strength!==p.field.strength||s.field.polarity!==p.field.polarity){s.field={...p.field};s.table=buildForceTable(s.field);}
  }
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
export function updateVisuals(state:VisualState,players:readonly Player[],phase:Phase,revision:number,dt:number,c:WarpConfig,freezeTime=false):void {
  if(revision!==state.revision)Object.assign(state,createVisualState(players,revision));
  if(phase!=='running'||!Number.isFinite(dt)||dt<=0)return;
  dt=Math.min(dt,0.1);if(!freezeTime)state.time+=dt;
  for(const e of state.events)if(e.alive){if(freezeTime){e.alive=false;continue;}e.age+=dt;if(e.age>=4*e.decay)e.alive=false;}
  for(let i=0;i<state.sources.length;i++) {
    const s=state.sources[i],p=players[i];
    if(!p||!(p.field.radius>0)||!Number.isFinite(p.position.x+p.position.y)){state.invalid++;continue;}
    s.position.x=p.position.x;s.position.y=p.position.y;
    if(!freezeTime)s.nodeClock+=dt*(.1+.13*s.weight+.1*Math.min(1,Math.hypot(p.velocity.x,p.velocity.y)/260));
    if(freezeTime){for(let h=0;h<16;h+=2){s.history[h]=p.position.x;s.history[h+1]=p.position.y;}}
    s.historyTime+=dt;if(s.historyTime>=.04){s.historyTime-=.04;s.historyIndex=(s.historyIndex+1)%8;s.history[s.historyIndex*2]=p.position.x;s.history[s.historyIndex*2+1]=p.position.y;}
    s.weight+=(Number(p.active)-s.weight)*(1-Math.exp(-dt/(p.active?0.12:0.35)));
    s.cooldown=Math.max(0,s.cooldown-dt);
    s.motion=!freezeTime&&p.active?Math.min(1,s.motion+Math.max(0,Math.hypot(p.velocity.x,p.velocity.y)-60)*dt/90):0;
    const activation=p.active&&!s.active;
    if(!freezeTime&&enabled(c)&&c.interaction&&p.active&&s.cooldown===0&&(activation||s.motion>=1)) {
      emit(state,s,p,c,activation?1:0.55);s.motion=0;
    }
    s.active=p.active;
  }
}
/** One shared sample produces both background displacement and luminance.
 * Unwarped WORLD points in; CSS displacement out. No physical state is written. */
export function sampleDisturbance(out:Sample,x:number,y:number,state:VisualState,c:WarpConfig,zoom:number,spatialScale=192):Sample {
  out.dx=0;out.dy=0;out.luminance=0;if(!enabled(c))return out;
  let ax=0,ay=0,core=1,brightness=0,ex=0,ey=0;
  const wx=x+(state.worldOrigin?.x??0),wy=y+(state.worldOrigin?.y??0),fabric=worldFabric(wx,wy);
  for(const s of state.sources) {
    if(s.weight<1e-8||s.field.radius<=0)continue;
    const rx=x-s.position.x,ry=y-s.position.y,r=Math.hypot(rx,ry),R=s.field.radius,w=envelope(r,R);
    if(w===0)continue;
    const soft=Math.sqrt(r*r+(R*0.04)**2),transition=r/Math.max(1e-9,Math.sqrt(r*r+((1-s.weight)*R*0.04)**2));
    const strength=lookupForce(s,r)*s.weight*transition,dir=-s.field.polarity/Math.max(r,1e-9);
    ax+=rx*dir*strength;ay+=ry*dir*strength;core*=1-w*s.weight*(1-r/soft);
    // Both nodes modulate the SAME fixed material. Node-relative noise would
    // carry a separate cloud around with each source even with correct anchors.
    brightness+=-s.field.polarity*strength/Math.sqrt(3600+strength*strength)*w*(.035+.035*fabric);
    const idle=c.idle*s.weight*w*-s.field.polarity*(Math.sin(state.time*2*Math.PI/23+wx/110)*.6+Math.sin(state.time*2*Math.PI/37+wy/97)*.4);
    brightness+=idle;ex+=idle*45*rx/soft;ey+=idle*45*ry/soft;
  }
  brightness*=core;
  const base=22*core/Math.sqrt(3600+ax*ax+ay*ay);
  if(c.interaction)for(const e of state.events)if(e.alive) {
    const rx=x-e.origin.x,ry=y-e.origin.y,r=Math.hypot(rx,ry),w=envelope(r,e.radius);if(w===0)continue;
    const soft=Math.sqrt(r*r+(e.radius*0.04)**2),q=(soft-e.radius*0.04-e.speed*e.age)/spatialScale+0.35*fabric;
    const temporal=smooth(e.age/0.09)*Math.exp(-e.age/e.decay)*(1-smooth((e.age-3.75*e.decay)/(0.25*e.decay)));
    const H=e.amplitude*temporal*w*(1+0.4*fabric)*(1-q*q)*Math.exp(-q*q/2);
    ex+=3*H*(-e.polarity*rx/soft+0.15*e.direction.x);ey+=3*H*(-e.polarity*ry/soft+0.15*e.direction.y);
    brightness+=-e.polarity*H*0.025;
  }
  // Model displacement is in world units until this single projection. The
  // Solar front refracts the SAME world material, never a new node-local cloud.
  if(c.interaction&&state.hazardWave){
    const wave=state.hazardWave,rx=x-wave.origin.x,ry=y-wave.origin.y,r=Math.hypot(rx,ry);
    const q=(r-wave.front+wave.thickness*.5)/Math.max(24,wave.thickness),w=Math.exp(-q*q*2);
    ex+=2.5*w*rx/Math.max(1,r);ey+=2.5*w*ry/Math.max(1,r);brightness+=.025*w*(.6+.4*fabric);
  }
  // Model displacement is in world units until this single projection. The
  // screen-pixel limit is an artistic safety cap, not a second camera transform.
  for(const portal of state.portals??[]){
    const rx=x-portal.origin.x,ry=y-portal.origin.y,r=Math.hypot(rx,ry),q=r/portal.radius;
    const w=Math.exp(-(((q-1.15)*2.3)**2))*Math.min(1,q),a=Math.atan2(ry,rx);
    const fold=w*(1+portal.approach*.65)*(1+.15*Math.sin(a*5+state.time*.2));
    ex+=(-rx*.12-ry*.035)*fold;ey+=(-ry*.12+rx*.035)*fold;brightness-=fold*.055;
  }
  const dx=(ax*base+ex)*zoom,dy=(ay*base+ey)*zoom,cap=Math.min(c.maxDisplacement,0.08*280*zoom);
  const limit=cap>0?1/Math.sqrt(1+(dx*dx+dy*dy)/(cap*cap)):0;
  if(c.starWarp&&cap>0){out.dx=dx*limit;out.dy=dy*limit;}
  const b=brightness*c.folds,max=b<0?0.1:0.06;
  if(c.luminance&&c.folds>0)out.luminance=max*Math.tanh(b/max);
  return out;
}
