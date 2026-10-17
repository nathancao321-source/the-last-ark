// Integer hash + quintic interpolation: deterministic on negative coordinates as
// well as positive, no random allocations in pixel loops, no DOM on import.
export function hash(x:number,y:number,seed=9511):number {
  let h=Math.imul(x,374761393)^Math.imul(y,668265263)^seed;
  h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;
}
const fade=(x:number)=>x*x*x*(x*(x*6-15)+10);
export function noise(x:number,y:number,seed=9511):number {
  const ix=Math.floor(x),iy=Math.floor(y),a=fade(x-ix),b=fade(y-iy);
  const n0=hash(ix,iy,seed),n1=hash(ix+1,iy,seed),n2=hash(ix,iy+1,seed),n3=hash(ix+1,iy+1,seed);
  return (n0+(n1-n0)*a)*(1-b)+(n2+(n3-n2)*a)*b;
}
export function fbm(x:number,y:number,octaves=5,seed=9511):number {
  let sum=0,weight=0.5,total=0;
  for(let i=0;i<octaves;i++){sum+=noise(x,y,seed+i*71)*weight;total+=weight;weight*=0.5;const xx=x;x=xx*1.8-y*0.8+17.1;y=xx*0.8+y*1.8+9.2;}
  return sum/total;
}
/** Warped contour ridges with clumpy illumination and dust extinction.
 * This is art, not a gas-density/astrophysics simulation. */
export function nebulaDensity(x:number,y:number):{filament:number;cloud:number;dust:number} {
  const wx=x+2.1*(fbm(x*.57,y*.57,3,81)-.5),wy=y+2.1*(fbm(x*.57+19,y*.57,3,38)-.5);
  const n=fbm(wx,wy,6)+.07*(fbm(wx*10,wy*10,3)-.5),ridge=Math.exp(-Math.abs(n-.5)*72);
  const branch=Math.exp(-Math.abs(fbm(wx*2.8+9,wy*2.8,4)-.48)*60);
  const cloud=Math.pow(fbm(wx*.62,wy*.62,4,901),2.8);
  const dust=Math.max(0,fbm(wx*1.5,wy*1.5,4,7)-.38);
  const knots=.35+fbm(wx*15,wy*15,3,19)*1.4;
  return {filament:(ridge*.78+branch*.22)*(.15+cloud*2.7)*knots,cloud,dust};
}
