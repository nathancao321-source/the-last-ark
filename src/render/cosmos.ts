/** Original procedural menu artwork. This module never reads or mutates the simulation. */
const TAU = Math.PI * 2;
const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
function random(seed: number): () => number { return () => { seed = (Math.imul(seed,1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
function noise(x: number, y: number, seed: number): number {
  const hash = (a: number,b: number) => { let n = Math.imul(a ^ seed,374761393) ^ Math.imul(b,668265263); n = Math.imul(n ^ (n >>> 13),1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  const ix = Math.floor(x), iy = Math.floor(y), dx = x-ix, dy = y-iy, u = dx*dx*(3-2*dx), v = dy*dy*(3-2*dy);
  return mix(mix(hash(ix,iy),hash(ix+1,iy),u),mix(hash(ix,iy+1),hash(ix+1,iy+1),u),v);
}
function cloud(x: number,y: number,seed: number, octaves = 5): number {
  let sum = 0, weight = .5, total = 0;
  for(let i=0;i<octaves;i++) { sum += noise(x,y,seed+i*31)*weight; total += weight; x=x*2.02+7.8; y=y*2.03-4.2; weight*=.5; }
  return sum / total;
}
function surface(w: number,h: number): [HTMLCanvasElement,CanvasRenderingContext2D] {
  const c = document.createElement('canvas'); c.width=w;c.height=h;
  return [c,c.getContext('2d')!];
}
function glow(ctx: CanvasRenderingContext2D,x: number,y: number,r: number,color: string): void {
  const gradient=ctx.createRadialGradient(x,y,0,x,y,r);gradient.addColorStop(0,color);gradient.addColorStop(1,'transparent');ctx.fillStyle=gradient;ctx.fillRect(x-r,y-r,r*2,r*2);
}
function starPlate(): HTMLCanvasElement {
  const [plate,c]=surface(1920,1080), [nebula,nc]=surface(480,270), pixels=nc.createImageData(480,270);
  for(let y=0;y<270;y++) for(let x=0;x<480;x++) {
    const bend = Math.sin(x*.011)*30, band = Math.exp(-Math.pow((y-150+x*.25-bend)/58,2));
    const n=cloud(x*.014,y*.019,73), dust=cloud(x*.036+20,y*.04,321,3);
    const density=Math.pow(n,2.5)*band*(1-dust*.8), index=(y*480+x)*4;
    pixels.data[index]=4+density*92;pixels.data[index+1]=5+density*72;pixels.data[index+2]=13+density*170;pixels.data[index+3]=255;
  }
  nc.putImageData(pixels,0,0);c.drawImage(nebula,0,0,1920,1080);
  const rng=random(40117);
  for(let i=0;i<2600;i++) {
    const x=rng()*1920,y=rng()*1080,l=Math.pow(rng(),4),r=.3+l*1.1;
    c.fillStyle=`rgba(${rng()>.8?'235,213,176':'186,204,228'},${.2+l*.74})`; c.beginPath();c.arc(x,y,r,0,TAU);c.fill();
    if(l>.9)glow(c,x,y,5.5,`rgba(167,197,234,${l*.34})`);
  }
  // An understated distant spiral, like a deep-sky exposure.
  c.save();c.translate(405,205);c.rotate(-.42);c.scale(1,.48);
  for(let arm=0;arm<2;arm++) for(let j=0;j<1100;j++) {
    const radius=9+rng()*155, angle=radius*.037+arm*Math.PI+(rng()-.5)*.45;
    glow(c,Math.cos(angle)*radius,Math.sin(angle)*radius,2+rng()*6,`rgba(164,176,201,${.009+(1-radius/170)*.035})`);
  }
  glow(c,0,0,43,'rgba(220,209,188,.34)');glow(c,0,0,14,'rgba(248,232,203,.5)');c.restore();
  // A second, colder nebula veil gives the menu a deep violet horizon.
  c.save();c.globalCompositeOperation='screen';
  glow(c,1500,730,410,'rgba(91,58,156,.055)');glow(c,1180,910,300,'rgba(58,87,161,.05)');
  c.restore();
  return plate;
}
const LIVE_STARS=(()=>{const rng=random(90317);return Array.from({length:280},()=>({x:rng(),y:rng(),r:.3+Math.pow(rng(),3)*1.7,a:.24+rng()*.62,p:rng()*TAU,s:.5+rng()*1.7,d:.35+rng()*1.35,warm:rng()<.28,flare:rng()>.9}));})();
const METEORS=[
  {x:.13,y:.13,dx:.30,dy:.12,period:14,delay:.7,duration:1.7},
  {x:.63,y:.09,dx:.26,dy:.10,period:19,delay:8.4,duration:1.3},
  {x:.81,y:.33,dx:-.31,dy:.12,period:23,delay:15.2,duration:1.5},
];
const AURORA=[
  {x:.18,y:.73,r:.42,c:'118,64,206',a:.085,p:0,s:.5,rot:-.28},
  {x:.48,y:.23,r:.38,c:'62,104,208',a:.07,p:2.1,s:.38,rot:.22},
  {x:.79,y:.62,r:.32,c:'164,76,198',a:.062,p:4.4,s:.44,rot:-.16},
  {x:.31,y:.36,r:.24,c:'88,126,224',a:.048,p:5.2,s:.6,rot:.3},
];
function drawAurora(c:CanvasRenderingContext2D,w:number,h:number,now:number,still:boolean):void {
  const t=still?0:now*.000034,size=Math.max(w,h);
  c.save();c.globalCompositeOperation='screen';
  for(const b of AURORA) {
    const x=(b.x+Math.sin(t*b.s+b.p)*.05)*w,y=(b.y+Math.cos(t*b.s*.8+b.p)*.042)*h,r=size*b.r;
    c.save();c.translate(x,y);c.rotate(b.rot+Math.sin(t*.6+b.p)*.1);c.scale(1.5,.64);
    const g=c.createRadialGradient(0,0,0,0,0,r);
    g.addColorStop(0,`rgba(${b.c},${b.a})`);g.addColorStop(.48,`rgba(${b.c},${b.a*.44})`);g.addColorStop(1,`rgba(${b.c},0)`);
    c.fillStyle=g;c.beginPath();c.arc(0,0,r,0,TAU);c.fill();c.restore();
  }
  for(let i=0;i<3;i++) {
    const y0=h*(.24+i*.26),ph=t*(.55+i*.15)+i*2.2;
    c.beginPath();c.moveTo(-w*.08,y0+Math.sin(ph)*h*.025);
    c.bezierCurveTo(w*.27,y0+Math.sin(ph+1.1)*h*.075,w*.62,y0+Math.cos(ph*.8)*h*.07,w*1.08,y0+Math.sin(ph+2.2)*h*.025);
    c.lineWidth=h*(.075+i*.028);c.strokeStyle=i===0?'rgba(122,74,208,.03)':'rgba(74,108,214,.025)';c.stroke();
    c.lineWidth=1;c.strokeStyle='rgba(176,154,244,.04)';c.stroke();
  }
  c.restore();
}
function drawLiveStars(c:CanvasRenderingContext2D,w:number,h:number,now:number,still:boolean,drift:number):void {
  const t=now*.001;
  c.save();
  for(const s of LIVE_STARS) {
    const travel=still?0:t*(3+s.d*5),sway=still?0:Math.sin(t*(.055+s.d*.035)+s.p)*7;
    const x=((s.x*w+drift*s.d*.8+travel+sway)%w+w)%w;
    const y=((s.y*h+(still?0:Math.cos(t*(.045+s.d*.03)+s.p*1.7)*6))%h+h)%h;
    const wave=.5+.5*Math.sin(t*(1.1+s.s*.9)+s.p);
    const twinkle=still?1:.34+.66*wave,flare=s.flare&&!still?Math.pow(wave,7)*.9:0;
    const a=Math.min(1,s.a*twinkle+flare);
    if(a<=.01)continue;
    c.beginPath();c.arc(x,y,s.r,0,TAU);
    c.fillStyle=s.warm?`rgba(242,216,182,${a})`:`rgba(190,212,255,${a})`;c.fill();
    if(s.flare&&(a>.3||flare>.08)) {
      const len=s.r*(4+flare*7);
      c.beginPath();c.moveTo(x-len,y);c.lineTo(x+len,y);c.moveTo(x,y-len);c.lineTo(x,y+len);
      c.strokeStyle=`rgba(200,220,255,${Math.min(1,a*.5+flare*.4)})`;c.lineWidth=.6;c.stroke();
    }
  }
  c.restore();
}
function drawMeteors(c:CanvasRenderingContext2D,w:number,h:number,now:number,still:boolean):void {
  if(still)return;
  c.save();c.globalCompositeOperation='screen';
  for(const m of METEORS) {
    const local=((now/1000+m.delay)%m.period+m.period)%m.period;
    if(local>m.duration)continue;
    const p=local/m.duration,fade=Math.sin(p*Math.PI);
    if(fade<=0)continue;
    const headX=(m.x+m.dx*p)*w,headY=(m.y+m.dy*p)*h;
    const travel=Math.hypot(m.dx*w,m.dy*h),ux=m.dx*w/travel,uy=m.dy*h/travel;
    const length=Math.max(90,w*.075)*(.55+fade*.45),tailX=headX-ux*length,tailY=headY-uy*length;
    const trail=c.createLinearGradient(tailX,tailY,headX,headY);
    trail.addColorStop(0,'rgba(160,190,255,0)');
    trail.addColorStop(.55,`rgba(198,214,255,${.3*fade})`);
    trail.addColorStop(1,`rgba(255,248,232,${.95*fade})`);
    c.strokeStyle=trail;c.lineWidth=1.8;c.beginPath();c.moveTo(tailX,tailY);c.lineTo(headX,headY);c.stroke();
    c.fillStyle=`rgba(255,251,242,${.95*fade})`;c.beginPath();c.arc(headX,headY,1.4,0,TAU);c.fill();
    glow(c,headX,headY,18,`rgba(255,232,200,${.32*fade})`);
  }
  c.restore();
}
function drawEclipse(c:CanvasRenderingContext2D,x:number,y:number,r:number):void {
  c.save();c.globalCompositeOperation='screen';
  glow(c,x,y,r*5.2,'rgba(125,78,190,.1)');glow(c,x,y,r*2.3,'rgba(255,164,112,.075)');
  c.beginPath();c.arc(x,y,r*1.035,0,TAU);c.strokeStyle='rgba(255,214,172,.34)';c.lineWidth=1.1;c.stroke();
  c.beginPath();c.arc(x,y,r*1.08,Math.PI*1.03,Math.PI*1.97);c.strokeStyle='rgba(172,126,224,.16)';c.lineWidth=3;c.stroke();
  c.restore();
  c.beginPath();c.arc(x,y,r,0,TAU);c.fillStyle='#020308';c.fill();
}
// Simplified internal geographic atlas; no remote textures or network dependency.
const LAND: number[][][] = [
  [[-168,71],[-145,70],[-130,57],[-125,48],[-118,32],[-105,23],[-97,17],[-84,9],[-78,9],[-82,21],[-90,23],[-80,27],[-75,36],[-66,45],[-59,52],[-70,60],[-95,72],[-120,75]],
  [[-81,12],[-71,12],[-58,5],[-48,-1],[-35,-7],[-42,-23],[-51,-32],[-66,-55],[-74,-47],[-74,-25],[-80,-5]],
  [[-53,60],[-42,60],[-23,72],[-30,82],[-48,83],[-63,75]],
  [[-17,36],[-4,36],[9,37],[23,32],[34,29],[43,12],[51,11],[42,1],[39,-14],[32,-28],[18,-35],[10,-17],[5,-2],[-7,5],[-16,14]],
  [[-10,36],[-9,44],[3,45],[-3,51],[-5,58],[9,58],[18,71],[29,70],[31,61],[47,67],[82,73],[106,77],[140,71],[170,64],[179,52],[159,59],[141,50],[133,41],[124,30],[121,21],[108,21],[106,9],[103,1],[98,5],[97,16],[88,22],[81,8],[75,10],[69,23],[58,25],[47,29],[43,13],[35,28],[35,36],[28,41],[21,39],[15,37],[12,43],[5,44]],
  [[113,-22],[116,-34],[131,-32],[141,-38],[153,-28],[145,-17],[136,-11],[124,-17]],
  [[130,32],[135,34],[139,39],[145,45],[143,36],[137,33]],
  [[95,5],[105,-6],[117,-8],[114,-3],[105,1]],[[120,-1],[135,-4],[150,-7],[146,-10],[134,-8]],[[46,-13],[50,-17],[47,-26],[44,-24]],
];
function earthPlate(): HTMLCanvasElement {
  const size=760, [planet,c]=surface(size,size),[atlas,ac]=surface(720,360);
  ac.fillStyle='#fff';
  for(const points of LAND) { ac.beginPath();points.forEach(([lon,lat],i)=>i?ac.lineTo((lon+180)*2,(90-lat)*2):ac.moveTo((lon+180)*2,(90-lat)*2));ac.closePath();ac.fill(); }
  const map=ac.getImageData(0,0,atlas.width,atlas.height).data, image=c.createImageData(size,size);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const nx=(x-size/2)/(size/2-2),ny=(y-size/2)/(size/2-2),rr=nx*nx+ny*ny;
    if(rr>=1)continue;
    const z=Math.sqrt(1-rr), lat=Math.asin(-ny), lon=Math.atan2(nx,z)+.48;
    const u=((lon/Math.PI*180+180)*2+720)%720,v=(90-lat/Math.PI*180)*2;
    const land=map[(Math.min(359,Math.floor(v))*720+Math.floor(u))*4+3]>0;
    const rough=cloud(u*.055,v*.055,51,4), clouds=clamp((cloud(u*.035+Math.sin(v*.045)*2,v*.045,513,5)-.50)*5.3);
    const light=clamp(nx*-.5+ny*-.37+z*.6),day=.035+Math.pow(light,1.4)*.92;
    let r=land?37+rough*49:9+rough*5,g=land?49+rough*38:29+rough*14,b=land?43+rough*26:57+rough*23;
    r=mix(r,200,clouds);g=mix(g,213,clouds);b=mix(b,224,clouds);
    const rim=Math.pow(1-z,3)*clamp(light+.12),idx=(y*size+x)*4;
    const city=land&&light<.33&&rough>.5&&noise(u*2.2,v*2.2,419)>.84 ? (1-light/.33)*Math.pow(noise(u*3,v*3,97),5)*160 : 0;
    image.data[idx]=r*day+rim*35+city;image.data[idx+1]=g*day+rim*105+city*.71;image.data[idx+2]=b*day+rim*185+city*.32;image.data[idx+3]=clamp((1-rr)*size)*255;
  }
  c.putImageData(image,0,0);return planet;
}
function drawShip(c: CanvasRenderingContext2D,x: number,y: number,scale: number): void {
  c.save();c.translate(x,y);c.rotate(-.25);c.scale(scale,scale);
  for(const rx of [-65,5,75]) {
    c.beginPath();c.ellipse(rx,0,13,47,0,0,TAU);c.lineWidth=5;c.strokeStyle='#101d2c';c.stroke();
    c.beginPath();c.ellipse(rx,0,13,47,0,Math.PI,TAU);c.lineWidth=1;c.strokeStyle='#8c9aaa';c.stroke();
    c.beginPath();c.moveTo(rx,-45);c.lineTo(rx,45);c.lineWidth=2;c.strokeStyle='#425063';c.stroke();
  }
  const metal=c.createLinearGradient(0,-16,0,18);metal.addColorStop(0,'#9ba5aa');metal.addColorStop(.12,'#526270');metal.addColorStop(.5,'#263447');metal.addColorStop(1,'#070d17');
  c.beginPath();c.moveTo(-131,-13);c.lineTo(100,-13);c.lineTo(140,1);c.lineTo(102,18);c.lineTo(-130,17);c.closePath();c.fillStyle=metal;c.fill();c.strokeStyle='#607284';c.lineWidth=.7;c.stroke();
  for(let i=0;i<28;i++) {
    const px=-121+i*8;c.fillStyle=i%3===0?'#536275':'#283648';c.fillRect(px,-10,5,22);
    c.fillStyle='#dfcd9d';c.fillRect(px,0,1.5,1.5);c.fillRect(px,4,1.5,1);
  }
  for(const rx of [-65,5,75]) { c.fillStyle='#172333';c.fillRect(rx-4,-15,8,33);c.fillStyle='#8895a1';c.fillRect(rx-4,-15,8,1.5); }
  c.fillStyle='#899cae';c.fillRect(102,-6,12,2);glow(c,118,-3,8,'rgba(171,217,248,.22)');
  c.strokeStyle='#576d7d';c.lineWidth=1;c.beginPath();c.moveTo(102,-12);c.lineTo(110,-30);c.lineTo(112,-10);c.moveTo(-112,-14);c.lineTo(-115,-31);c.stroke();
  c.restore();
}
export function mountCosmos(canvas: HTMLCanvasElement): { dispose(): void } {
  const ctx=canvas.getContext('2d');if(!ctx)return {dispose(){}};
  const stars=starPlate(),earth=earthPlate(),motion=matchMedia('(prefers-reduced-motion: reduce)');
  let width=0,height=0,dpr=1,frame=0,last=-Infinity,lastScreen='',disposed=false;
  function resize() { width=window.innerWidth;height=window.innerHeight;dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);last=-Infinity; }
  function draw(now: number) {
    if(disposed)return;
    frame=requestAnimationFrame(draw);
    const screen=document.body.dataset.screen??'cover', changed=screen!==lastScreen;
    if(!changed && (document.hidden || screen==='game' || (motion.matches && last!==-Infinity) || now-last<50))return;
    last=now;lastScreen=screen;
    const c=ctx!;c.setTransform(dpr,0,0,dpr,0,0);c.fillStyle='#03060c';c.fillRect(0,0,width,height);
    const drift=motion.matches?0:Math.sin(now*.000082)*20+Math.cos(now*.000039)*9;
    const rise=motion.matches?0:Math.cos(now*.000057)*11;
    const ratio=Math.max(width/1920,height/1080),sw=1920*ratio+110,sh=1080*ratio+80;
    c.drawImage(stars,(width-sw)/2+drift,(height-sh)/2+rise,sw,sh);
    drawAurora(c,width,height,now,motion.matches);
    drawLiveStars(c,width,height,now,motion.matches,drift);
    drawMeteors(c,width,height,now,motion.matches);
    if(screen==='menu') {
      const mobile=width<=800,r=mobile?98:Math.min(width*.19,height*.245),x=mobile?width*.70:width*.255,y=mobile?415:Math.max(468,height*.69);
      glow(c,x-r*.3,y-r*.18,r*1.22,'rgba(38,89,144,.16)');
      glow(c,x-r*.4,y-r*.34,r*1.5,'rgba(255,174,112,.042)');
      c.save();c.translate(x,y);c.rotate(-.15);c.drawImage(earth,-r,-r,r*2,r*2);c.restore();
      // A thin atmospheric limb keeps the globe from reading as a flat texture.
      c.save();c.globalCompositeOperation='screen';
      c.beginPath();c.arc(x,y,r*1.003,Math.PI*1.08,Math.PI*1.9);c.strokeStyle='rgba(137,180,238,.18)';c.lineWidth=1.6;c.stroke();
      c.strokeStyle='rgba(76,116,196,.055)';c.lineWidth=9;c.stroke();c.restore();
      // Delicate navigation orbit, kept behind content.
      c.save();c.translate(x,y);c.rotate(-.25);c.strokeStyle='rgba(154,181,216,.16)';c.lineWidth=.7;c.setLineDash([2,8]);c.beginPath();c.ellipse(0,0,r*1.26,r*.37,0,.05,Math.PI*1.05);c.stroke();c.restore();
      drawShip(c,x+r*(mobile ? .44 : .56),y-r*.03,mobile ? .42 : Math.min(1.05,width/1450));
      const shade=c.createLinearGradient(0,0,width,0);shade.addColorStop(0,'rgba(2,5,12,.2)');shade.addColorStop(.36,'transparent');shade.addColorStop(.61,'rgba(2,5,12,.6)');shade.addColorStop(1,'rgba(2,5,12,.4)');c.fillStyle=shade;c.fillRect(0,0,width,height);
      const left=c.createLinearGradient(0,0,width*.52,0);left.addColorStop(0,'rgba(2,5,12,.5)');left.addColorStop(.55,'rgba(2,5,12,.13)');left.addColorStop(1,'rgba(2,5,12,0)');c.fillStyle=left;c.fillRect(0,0,width*.52,height);
      const top=c.createLinearGradient(0,0,0,height*.5);top.addColorStop(0,'rgba(2,5,12,.34)');top.addColorStop(1,'rgba(2,5,12,0)');c.fillStyle=top;c.fillRect(0,0,width*.62,height*.5);
    } else {
      const r=width*.73,x=width*.52,y=height+r*.82;
      const eclipseR=Math.max(16,Math.min(width,height)*(width<=800 ? .04 : .052));
      drawEclipse(c,width*.795,height*.225,eclipseR);
      glow(c,width*.52,height*1.08,width*.53,'rgba(44,83,134,.13)');
      c.save();c.globalAlpha=.52;c.drawImage(earth,x-r,y-r,r*2,r*2);c.restore();
      c.save();c.globalCompositeOperation='screen';c.beginPath();c.arc(x,y,r*.999,Math.PI*1.1,Math.PI*1.9);c.strokeStyle='rgba(123,170,235,.13)';c.lineWidth=1.4;c.stroke();c.restore();
      drawShip(c,width*.82,height*.72,Math.min(.45,width/2800));
      const shade=c.createRadialGradient(width*.5,height*.4,20,width*.5,height*.45,width*.6);shade.addColorStop(0,'rgba(2,5,12,.4)');shade.addColorStop(.8,'rgba(2,5,12,.08)');shade.addColorStop(1,'rgba(2,5,12,.5)');c.fillStyle=shade;c.fillRect(0,0,width,height);
    }
  }
  const observer=new ResizeObserver(resize);observer.observe(document.documentElement);resize();frame=requestAnimationFrame(draw);
  return {dispose(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();}};
}
