import type { GameState } from './types';
import type { JetConfig, JetPhase, MotionChord } from './hazard-types';
import { capsuleExposure, expandingRingContact, interpolate } from '../physics/hazard-collision';
import {jetGeometry,shockwaveRadius} from './hazard-geometry';
const EPS=1e-8;
export function jetClock(config:JetConfig,time:number): {phase:JetPhase;cycle:number;progress:number;next:number} {
  const stages: [JetPhase,number][]=[['idle',config.idle],['warning',config.warning],['firing',config.firing],['dissipating',config.dissipating],['cooldown',config.cooldown]];
  const period=stages.reduce((n,s)=>n+s[1],0),cycle=Math.floor((time+EPS)/period);
  let start=cycle*period;
  for(const [phase,duration] of stages) {
    if(time+EPS<start+duration)return {phase,cycle,progress:Math.max(0,(time-start)/duration),next:start+duration};
    start+=duration;
  }
  return {phase:'idle',cycle:cycle+1,progress:0,next:start+config.idle};
}
export function initializeHazards(game:GameState):void {
  if(!game.level.solarWave&&!game.level.blackHoleJets)return;
  game.hazards={};
  if(game.level.blackHoleJets){const config=game.level.blackHoleJets,clock=jetClock(config,0),source=game.bodies.find(b=>b.id===config.sourceId);game.hazards.jet={...clock,exposed:false,protectedUntil:0,geometry:source?jetGeometry(source.position,source.radius,config,clock):undefined};}
}
export function waveRadius(game:GameState,time:number):number {
  const wave=game.hazards?.wave;
  return wave?shockwaveRadius(wave,time):0;
}
/** Simulation clock only. Launch geometry survives checkpoints and subsequent sun
 * motion. A transformed/exploded sun releases scheduled residual energy as well.
 * Invalid geometry disables emission with an explicit diagnostic. */
export function updateHazards(game:GameState,path:MotionChord[],dt:number):string|undefined {
  const state=game.hazards;if(!state||game.phase!=='running')return;
  const start=game.elapsed-dt,ship=game.bodies.find(b=>b.kind==='ship')!;
  const chords=path.slice(),last=chords.at(-1);
  if(!last||last.end<dt-EPS)chords.push({from:last?.to??ship.position,to:ship.position,start:last?.end??0,end:dt});
  const solar=game.level.solarWave;
  if(solar&&!state.wave&&!state.configurationError&&game.elapsed+EPS>=solar.launchAt) {
    const source=game.bodies.find(b=>b.id===solar.sourceId),exit=game.bodies.find(b=>b.id===solar.exitId);
    const radius=source?.radius??0,distance=source&&exit?Math.hypot(exit.position.x-source.position.x,exit.position.y-source.position.y):0;
    if(!source||!exit||!Number.isFinite(distance+radius+solar.shockwaveTravelTime)||distance<=radius||solar.shockwaveTravelTime<=0)state.configurationError='能量波配置无效：出口必须在太阳表面之外';
    else state.wave={origin:{...source.position},radius0:radius,speed:(distance-radius)/solar.shockwaveTravelTime,launchedAt:solar.launchAt,front:radius,active:true,targetDistance:distance,thickness:solar.thickness,endsAt:solar.launchAt+Math.max(solar.duration,solar.shockwaveTravelTime+5),travelTime:solar.shockwaveTravelTime};
  }
  if(solar&&state.wave){
    const wave=state.wave;
    wave.front=waveRadius(game,game.elapsed);
    wave.active=game.elapsed+EPS>=wave.launchedAt&&game.elapsed<wave.endsAt;
    for(const chord of chords){
      const a=Math.max(start+chord.start,wave.launchedAt),b=Math.min(start+chord.end,wave.endsAt);
      if(b<a||chord.end-chord.start<EPS)continue;
      const position=(t:number)=>interpolate(chord.from,chord.to,(t-start-chord.start)/(chord.end-chord.start));
      if(expandingRingContact(position(a),position(b),wave.origin,waveRadius(game,a),waveRadius(game,b),wave.thickness,ship.radius)) {
        if(game.health)game.health.current=0;state.impactUntil=game.elapsed+.65;
        return '恒星灭绝能量波命中：方舟被摧毁';
      }
    }
  }
  const jet=game.level.blackHoleJets,hit=state.jet;
  if(jet&&hit){
    const source=game.bodies.find(b=>b.id===jet.sourceId);
    const finalClock=jetClock(jet,game.elapsed);
    hit.geometry=source&&source.layer!=='hidden'?jetGeometry(source.position,source.radius,jet,finalClock):undefined;
    if(source&&source.layer!=='hidden')for(const chord of chords){
      let a=start+chord.start;const end=start+chord.end;
      if(end-a<EPS)continue;
      const position=(t:number)=>interpolate(chord.from,chord.to,(t-start-chord.start)/(chord.end-chord.start));
      while(a<end-EPS){
        const clock=jetClock(jet,a),b=Math.min(end,clock.next);
        if(clock.cycle!==hit.cycle||clock.phase!=='firing')hit.exposed=false;
        hit.cycle=clock.cycle;
        if(clock.phase==='firing'){
          const geometry=jetGeometry(source.position,source.radius,jet,clock);
          const intervals=geometry.beams.flatMap(beam=>{
            const interval=capsuleExposure(position(a),position(b),beam.start.x,beam.start.y,beam.end.y,beam.coreRadius+ship.radius);
            return interval?[interval]:[];
          }).sort((u,v)=>u[0]-v[0]);
          let cursor=0;
          for(const [enter,leave] of intervals){
            if(enter>cursor+EPS)hit.exposed=false;
            const contactTime=a+(b-a)*enter;
            // Consume an exposure even during grace: remaining inside cannot cause
            // a delayed second hit when invulnerability expires.
            if(!hit.exposed&&contactTime+EPS>=hit.protectedUntil&&game.health){
              game.health.current=Math.max(0,game.health.current-game.health.max*.5);
              hit.protectedUntil=contactTime+jet.invulnerability;state.impactUntil=game.elapsed+.65;
              if(game.health.current<=0){
                // A terminal CCD contact can precede the end-of-step phase. Freeze
                // the exact firing snapshot that caused death, never a later fade.
                const contactClock=jetClock(jet,contactTime);
                hit.geometry=jetGeometry(source.position,source.radius,jet,contactClock);
                hit.phase=contactClock.phase;hit.progress=contactClock.progress;
                return '伽马喷流命中：方舟船体失效';
              }
            }
            hit.exposed=true;cursor=leave;
          }
          if(!intervals.length||cursor<1-EPS)hit.exposed=false;
        }
        a=b;
      }
    }
    const clock=jetClock(jet,game.elapsed);
    if(clock.phase!=='firing'||clock.cycle!==hit.cycle)hit.exposed=false;
    Object.assign(hit,{phase:clock.phase,cycle:clock.cycle,progress:clock.progress});
  }
}
export function hazardNotice(game:GameState):string|undefined {
  if(game.hazards?.configurationError)return game.hazards.configurationError;
  const solar=game.level.solarWave;
  if(solar&&game.elapsed>=solar.launchAt-solar.warningSeconds&&game.elapsed<solar.launchAt)
    return `太阳能量异常 · ${(solar.launchAt-game.elapsed).toFixed(1)} 秒后爆发`;
  if(game.hazards?.wave?.active)return '灭绝波向外扩散 · 逃离金色高能环带';
  const jet=game.hazards?.jet;
  if(jet?.phase==='warning')return '伽马喷流预警 · 避开黑洞上下蓝色轴线';
  if(jet?.phase==='firing')return '伽马喷流激活 · 每次独立命中损失 50% 船体';
  if(jet?.phase==='dissipating')return '喷流消散 · 轴线已无伤害';
}
