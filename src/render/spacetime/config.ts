export type Quality = 'off'|'low'|'medium'|'high';
export interface WarpConfig {
  quality:Quality; starWarp:boolean; luminance:boolean; interaction:boolean;
  maxDisplacement:number; folds:number; propagation:number; decay:number; idle:number;
}
export const DEFAULT_WARP:WarpConfig={quality:'high',starWarp:true,luminance:true,interaction:true,
  maxDisplacement:24,folds:1.5,propagation:240,decay:0.85,idle:0.002};
export const BUDGET={off:0,low:0,medium:64,high:96} as const;
export const RANGES={maxDisplacement:[0,40,1],folds:[0,2,0.05],propagation:[60,500,10],decay:[0.25,2,0.05],idle:[0,0.004,0.0002]} as const;
export type NumericParameter=keyof typeof RANGES;
export function setParameter(config:WarpConfig,key:NumericParameter,value:number):void {
  if(Number.isFinite(value))config[key]=Math.max(RANGES[key][0],Math.min(RANGES[key][1],value));
}
export function parseWarp(search:string):WarpConfig {
  const p=new URLSearchParams(search),c={...DEFAULT_WARP},q=p.get('fx');
  if(q&&Object.hasOwn(BUDGET,q))c.quality=q as Quality;
  for(const key of Object.keys(RANGES) as NumericParameter[])if(p.has(key))setParameter(c,key,Number(p.get(key)));
  return c;
}
export const enabled=(c:WarpConfig)=>c.quality==='medium'||c.quality==='high';
