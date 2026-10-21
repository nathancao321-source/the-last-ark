import type { GameState } from '../game/types';
import type { Camera } from '../camera/camera';
import { viewBounds } from '../camera/camera';
import { HAZARD } from './palette';
import {jetParticle,jetSpatialFade,jetVisualEnvelope,waveGeometry} from '../game/hazard-geometry';

/** Read-only world-space rendering. Fixed budgets, no persistent particles or
 * camera-relative noise. Enhanced=false preserves mandatory hazard silhouettes. */
export function drawHazards(ctx:CanvasRenderingContext2D,game:GameState,camera:Camera,enhanced:boolean,quality='medium'):void {
  const view=viewBounds(camera),state=game.hazards;if(!state)return;
  const fine=enhanced&&quality!=='low',t=game.elapsed;
  const j=state.jet?.geometry;
  if(j){
    const legacyGuide=!enhanced&&(j.phase==='idle'||j.phase==='cooldown');
    if(j.intensity>0||legacyGuide){
      const envelope=jetVisualEnvelope(j),opacity=legacyGuide?.025:envelope.opacity;
      for(const jet of j.beams){
        const sign=jet.direction,x=jet.start.x,y=jet.start.y,extent=jet.visualLength,end=y+sign*extent;
        if(x+jet.plumeRadius<view.minX||x-jet.plumeRadius>view.maxX||Math.max(y,end)+jet.plumeRadius<view.minY||Math.min(y,end)-jet.plumeRadius>view.maxY)continue;
        ctx.save();ctx.translate(x,y);ctx.scale(1,sign);ctx.lineCap='round';ctx.setLineDash([]);
        // Every axial layer uses the SAME envelope, sampled into a continuous
        // Canvas gradient. No opaque marker strokes or special test-only paths.
        const axial=(color:readonly number[],alpha=1)=>{
          const g=ctx.createLinearGradient(0,0,0,extent);
          for(let i=0;i<=40;i++){const u=i/40;g.addColorStop(u,'rgba('+color.join(',')+','+(alpha*jetSpatialFade(u*extent,extent))+')');}return g;
        };
        if(enhanced){
          ctx.fillStyle=axial([95,112,224]);
          for(let layer=3;layer>=1;layer--){
            ctx.globalAlpha=opacity*.1;ctx.beginPath();
            for(const side of [-1,1])for(let n=0;n<=48;n++){
              const u=side<0?n/48:1-n/48,noise=Math.sin(u*28-t*2.2+layer)*Math.sin(u*13+t*.7);
              const width=(jet.coreRadius+(jet.plumeRadius-jet.coreRadius)*(layer/3)*(.2+.8*u)*(1+.13*noise))*(.4+.6*envelope.width);
              const xx=side*width,yy=u*extent;if(side<0&&n===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);
            }ctx.closePath();ctx.fill();
          }
          // Tail is diffuse blue/violet, never an extension of the white lethal
          // core. It fades beyond the visible rounded end of the damage capsule.
          ctx.strokeStyle=axial([89,101,214]);ctx.globalAlpha=opacity*.17;ctx.lineWidth=jet.coreRadius*1.9*envelope.width;
          ctx.beginPath();ctx.moveTo(0,jet.length);ctx.lineTo(0,extent);ctx.stroke();
        }
        const coreFade=axial([100+50*envelope.heat,130+88*envelope.heat,220+35*envelope.heat]);
        // Continuous violet seed -> blue-white energy; never dash the game beam.
        // Warning reaches full geometry before the authoritative firing instant.
        ctx.lineWidth=jet.coreRadius*2*envelope.width;ctx.strokeStyle=coreFade;ctx.globalAlpha=opacity;
        // The full-width, readable capsule ends at the authoritative hazard end.
        // A rounded cap distinguishes it from the much dimmer, harmless tail.
        ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,jet.length);ctx.stroke();
        ctx.fillStyle=axial([237,250,255]);ctx.globalAlpha=opacity*(.12+.6*envelope.heat);
        // The white filament tapers inside the readable blue capsule. It does
        // not carry a flat, full-brightness cap into the non-damaging tail.
        ctx.beginPath();for(const side of [-1,1])for(let n=0;n<=48;n++){
          const u=side<0?n/48:1-n/48,v=Math.max(0,(u-.5)/.5),taper=1-v*v*(3-2*v),xx=side*jet.coreRadius*.36*taper*envelope.width;
          if(side<0&&n===0)ctx.moveTo(xx,0);else ctx.lineTo(xx,u*jet.length);
        }ctx.closePath();ctx.fill();
        if(enhanced){
          ctx.strokeStyle=axial([125,199,250]);ctx.lineWidth=jet.coreRadius*.23*envelope.width;ctx.globalAlpha=opacity*.13;
          for(let strand=0;strand<(fine?5:2);strand++){
            ctx.beginPath();for(let n=0;n<=64;n++){
              const u=n/64,xx=Math.sin(u*23-t*3+strand*2.4)*jet.coreRadius*.65*Math.min(1,u*extent/80)*envelope.width;
              if(n===0)ctx.moveTo(xx,0);else ctx.lineTo(xx,u*extent);
            }ctx.stroke();
          }
          // A single simulation clock spans warning/firing/fade. Wrapped
          // particles are invisible at the far end and ease in at the root.
          for(let n=0;n<(fine?48:16);n++){
            const p=jetParticle(jet,n,t,true),xx=(p.x-x)*envelope.width,yy=(p.y-y)*sign;
            const root=Math.min(1,yy/60),tail=yy>jet.length?.18:1;
            const birth=Math.max(0,Math.min(1,(envelope.density-(n%12)/16)*4));
            ctx.globalAlpha=opacity*.6*birth*birth*(3-2*birth)*jetSpatialFade(yy,extent)*root*root*(3-2*root)*tail;
            ctx.strokeStyle=yy>jet.length?HAZARD.jetPlume:HAZARD.jetCore;ctx.lineWidth=1.2/camera.zoom;
            ctx.beginPath();ctx.moveTo(xx,yy);ctx.lineTo(xx,Math.min(extent,yy+12));ctx.stroke();
          }
        }
        ctx.restore();
      }
    }
  }
  const solar=game.level.solarWave,w=state.wave;
  if(solar&&!w&&t>=solar.launchAt-solar.warningSeconds&&t<solar.launchAt){
    const source=game.bodies.find(b=>b.id===solar.sourceId);
    if(source){ctx.save();ctx.strokeStyle=HAZARD.waveGold;ctx.globalAlpha=.15+.35*(t-solar.launchAt+solar.warningSeconds)/solar.warningSeconds;
      ctx.lineWidth=5/camera.zoom;ctx.beginPath();ctx.arc(source.position.x,source.position.y,source.radius+8,0,Math.PI*2);ctx.stroke();ctx.restore();}
  }
  if(solar&&w?.active){
    const geometry=waveGeometry(w),r=geometry.center,half=geometry.thickness*.5;
    const dx=Math.max(view.minX-w.origin.x,0,w.origin.x-view.maxX),dy=Math.max(view.minY-w.origin.y,0,w.origin.y-view.maxY);
    const maxDistance=Math.max(...[view.minX,view.maxX].flatMap(x=>[view.minY,view.maxY].map(y=>Math.hypot(x-w.origin.x,y-w.origin.y))));
    if(Math.hypot(dx,dy)>w.front+half||maxDistance<r-half*2)return;
    ctx.save();ctx.lineCap='round';
    // Only tessellate the visible angular interval. Smooth connected world-space
    // contours remove the staircase at independent arc boundaries, at any zoom.
    const vx=camera.position.x-w.origin.x,vy=camera.position.y-w.origin.y,d=Math.hypot(vx,vy);
    const viewRadius=Math.hypot(camera.width,camera.height)/(2*camera.zoom)+geometry.thickness*2;
    const span=d>viewRadius?Math.asin(Math.min(1,viewRadius/d)):Math.PI,angle=Math.atan2(vy,vx);
    const segments=Math.min(fine?1024:384,Math.max(24,Math.ceil(span*2*r*camera.zoom/4)));
    const contour=(offset:number,textureScale:number)=>{
      ctx.beginPath();for(let n=0;n<=segments;n++){
        const a=angle-span+2*span*n/segments;
        const noise=(Math.sin(a*73+t*.8)+Math.sin(a*137-t*.5))*geometry.thickness*.045*textureScale;
        const radius=Math.max(1,r+offset+noise),x=w.origin.x+Math.cos(a)*radius,y=w.origin.y+Math.sin(a)*radius;
        if(n===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }ctx.stroke();
    };
    const layers=enhanced?(fine?12:6):1;
    for(let layer=layers;layer>=1;layer--){
      const u=layer/layers;
      ctx.strokeStyle=u>.65?HAZARD.waveEdge:u>.3?HAZARD.waveGold:HAZARD.waveCore;
      ctx.globalAlpha=enhanced?.12+.11*(1-u):.8;
      ctx.lineWidth=geometry.thickness*(enhanced?.12+.78*u*u:1);
      contour(0,enhanced?1:0);
    }
    if(fine){
      ctx.strokeStyle=HAZARD.waveCore;ctx.lineWidth=Math.max(.6/camera.zoom,geometry.thickness*.025);
      for(let strand=0;strand<5;strand++){ctx.globalAlpha=.15;contour(Math.sin(strand*2.3+t*.2)*geometry.thickness*.32,1+strand*.2);}
    }
    ctx.restore();
  }
}
/** Called only through the development panel. Never included in normal play. */
export function drawHazardColliders(ctx:CanvasRenderingContext2D,game:GameState,camera:Camera):void {
 ctx.save();ctx.lineCap='round';ctx.font=`${12/camera.zoom}px monospace`;ctx.textAlign='left';
 const jet=game.hazards?.jet?.geometry;
 if(jet)for(const beam of jet.beams){
  ctx.globalAlpha=jet.damaging?.24:.06;ctx.strokeStyle=HAZARD.debugArea;ctx.lineWidth=beam.coreRadius*2;ctx.beginPath();ctx.moveTo(beam.start.x,beam.start.y);ctx.lineTo(beam.end.x,beam.end.y);ctx.stroke();
  ctx.globalAlpha=.95;ctx.strokeStyle=HAZARD.debugAxis;ctx.lineWidth=1/camera.zoom;ctx.beginPath();ctx.moveTo(beam.start.x,beam.start.y);ctx.lineTo(beam.end.x,beam.end.y);ctx.stroke();
  for(const p of [beam.start,beam.end]){ctx.beginPath();ctx.arc(p.x,p.y,4/camera.zoom,0,Math.PI*2);ctx.stroke();}
  ctx.fillStyle=HAZARD.debugAxis;ctx.fillText(`${jet.phase} #${jet.cycle} · W=${beam.coreRadius*2} · L=${beam.length} · damage=${jet.damaging}`,beam.start.x+35/camera.zoom,beam.start.y+beam.direction*60/camera.zoom);
 }
 const w=game.hazards?.wave;if(w?.active){const band=waveGeometry(w);ctx.globalAlpha=.26;ctx.strokeStyle=HAZARD.debugArea;ctx.lineWidth=band.thickness;ctx.beginPath();ctx.arc(w.origin.x,w.origin.y,band.center,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;ctx.strokeStyle=HAZARD.debugAxis;ctx.lineWidth=1/camera.zoom;for(const r of [band.inner,band.outer]){ctx.beginPath();ctx.arc(w.origin.x,w.origin.y,r,0,Math.PI*2);ctx.stroke();}}
 ctx.restore();
}
export function drawHazardImpact(ctx:CanvasRenderingContext2D,game:GameState,camera:Camera):void {
  const remaining=(game.hazards?.impactUntil??0)-game.elapsed;
  if(remaining<=0)return;
  ctx.save();ctx.globalAlpha=Math.min(.5,remaining);ctx.strokeStyle=HAZARD.impact;ctx.lineWidth=8;
  ctx.strokeRect(4,4,camera.width-8,camera.height-8);ctx.restore();
}
