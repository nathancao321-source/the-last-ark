import {describe,it,expect} from 'vitest';
import {abyssColor,generateAbyssTile,ABYSS_RES,ABYSS_GUTTER} from '../src/render/spacetime/abyss-material';
import {CINEMATIC_ART} from '../src/render/spacetime/art';
describe('nonperiodic world nebula',()=>{
 it('retains identical neighboring gutter samples in both axes, including negative chunks',()=>{
  const art={...CINEMATIC_ART},a=generateAbyssTile({key:'a',x:-1024,y:0,span:1024,art}),b=generateAbyssTile({key:'b',x:0,y:0,span:1024,art}),c=generateAbyssTile({key:'c',x:-1024,y:1024,span:1024,art}),size=ABYSS_RES+ABYSS_GUTTER*2;
  for(let n=0;n<size;n++){
   expect(a.slice((n*size+ABYSS_RES)*4,(n*size+ABYSS_RES+2)*4)).toEqual(b.slice(n*size*4,(n*size+2)*4));
   expect(a.slice((ABYSS_RES*size+n)*4,(ABYSS_RES*size+n+1)*4)).toEqual(c.slice(n*4,(n+1)*4));
  }
 });
 it('has continuous boundaries without a repeated 2400-unit silhouette',()=>{
  let different=0;
  for(let n=-20;n<20;n++){
   const x=n*127,y=n*73,a=abyssColor(x,y,CINEMATIC_ART),b=abyssColor(x+2400,y,CINEMATIC_ART);
   different+=Math.abs(a[2]-b[2]);expect(abyssColor(x+1e-5,y,CINEMATIC_ART)[2]).toBeCloseTo(a[2],3);
   expect(a.every(v=>Number.isFinite(v)&&v>=0&&v<=255)).toBe(true);
  }
  expect(different).toBeGreaterThan(50);
 });
});
