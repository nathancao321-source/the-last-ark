/** Demo-only art controls. No gameplay configuration is changed here. */
export interface ArtConfig {background:'dense'|'sparse'|'baseline';nebula:number;stars:number;exposure:number;nodeEnergy:number;particles:boolean}
export const DEFAULT_ART:ArtConfig={background:'dense',nebula:1,stars:1,exposure:1,nodeEnergy:1,particles:true};
export const ART_LIMITS={nebula:[0,2,0.05],stars:[0.1,2,0.1],exposure:[0.4,1.6,0.05],nodeEnergy:[0.3,1.8,0.05]} as const;
export type ArtParameter=keyof typeof ART_LIMITS;
export function setArt(c:ArtConfig,key:ArtParameter,n:number):void {if(Number.isFinite(n))c[key]=Math.max(ART_LIMITS[key][0],Math.min(ART_LIMITS[key][1],n));}
