import type { Body } from '../game/types';
import type { SectorKey } from './sectors';
import { SECTOR_SIZE } from './sectors';

export const COLD_BUDGET=64*1024*1024;
export interface WorldIdentity {id:string;seed:number;version:3;epoch:number}
export interface ChunkSnapshot {key:SectorKey;bodies:Body[]}
export interface ColdRecord extends ChunkSnapshot {id:string;world:string;sites:string[];bytes:number;checksum:number}
export interface ColdStats {bytes:number;records:number}
export interface SavedExpedition {world:WorldIdentity;manifest:string;bytes:number}
export interface ExpeditionStore {
 read(world:WorldIdentity,cells:SectorKey[]):Promise<ChunkSnapshot[]>;
 write(world:WorldIdentity,snapshots:ChunkSnapshot[]):Promise<ColdStats>;
 save(world:WorldIdentity,snapshots:ChunkSnapshot[],manifest:string):Promise<void>;
 restore(validate?:(manifest:string,world:WorldIdentity)=>boolean):Promise<SavedExpedition|undefined>;
}
export const payloadBytes=(value:unknown)=>new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value)).byteLength;
export const cellId=(p:SectorKey)=>`${p.x},${p.y}`;
export const newWorld=(seed:number):WorldIdentity=>({id:globalThis.crypto.randomUUID(),seed,version:3,epoch:0});
export function validKey(p:unknown):p is SectorKey {
 const k=p as SectorKey;return !!k&&Number.isSafeInteger(k.x)&&Number.isSafeInteger(k.y)&&Math.max(Math.abs(k.x),Math.abs(k.y))<=2**40;
}
const point=(p:{x:number;y:number})=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.max(Math.abs(p.x),Math.abs(p.y))<1e16;
export function validSnapshot(s:ChunkSnapshot):boolean {
 return !!s&&validKey(s.key)&&Array.isArray(s.bodies)&&s.bodies.length<=6&&new Set(s.bodies.map(b=>b.id)).size===s.bodies.length&&s.bodies.every(b=>
  !!b&&typeof b.id==='string'&&b.id.length<100&&['star','planet','asteroid'].includes(b.kind)&&point(b.position)&&point(b.velocity)&&validKey(b.chunk)&&cellId(b.chunk)===cellId(s.key)
  &&Number.isFinite(b.radius)&&b.radius>0&&b.radius<=512&&Number.isFinite(b.response)&&typeof b.affectedByFields==='boolean'
  &&['gravityRadius','gravityStrength','gravitySoftening','gravityResponse','density','maxSpeed'].every(k=>!(k in b)||Number.isFinite(b[k as keyof Body]))
  &&(!b.stabilizationState||(point(b.stabilizationState.playerVelocity)&&Number.isFinite(b.stabilizationState.idleTime)))
  &&(!b.stabilization||(Number.isFinite(b.stabilization.halfLife)&&b.stabilization.halfLife>0))
  &&(!b.contact||(!('mass' in b.contact)||(Number.isFinite(b.contact.mass)&&b.contact.mass!>0)))
  &&!b.orbit&&!b.nodeInfluence&&!b.damageZone&&!b.stellar&&!b.displacementLimit);
}
function record(world:WorldIdentity,s:ChunkSnapshot):ColdRecord {
 if(!validSnapshot(s))throw Error('冷快照损坏，已保留当前状态');
 const sites=[...new Set(s.bodies.map(b=>`${world.id}:${cellId({x:s.key.x+Math.floor(b.position.x/SECTOR_SIZE),y:s.key.y+Math.floor(b.position.y/SECTOR_SIZE)})}`))];
 const r={...structuredClone(s),id:`${world.id}:${cellId(s.key)}`,world:world.id,sites,bytes:0,checksum:0};
 r.checksum=checksum(r);r.bytes=payloadBytes({...r,bytes:undefined});return r;
}
function checksum(r:ColdRecord):number {let h=2166136261;for(const c of JSON.stringify({...r,bytes:undefined,checksum:undefined}))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
function verify(r:ColdRecord):void {if(!validSnapshot(r)||!Number.isSafeInteger(r.bytes)||r.bytes<0||r.bytes!==payloadBytes({...r,bytes:undefined})||r.checksum!==checksum(r))throw Error('冷快照损坏，探索已暂停');}
function same(a:WorldIdentity,b:WorldIdentity){return a.id===b.id&&a.seed===b.seed&&a.version===b.version&&a.epoch===b.epoch;}
/** Test/non-browser adapter with the same transactions, position index and budget.
 * It belongs to a single game unless explicitly shared by a test. */
export class MemoryExpeditionStore implements ExpeditionStore {
 protected worlds=new Map<string,{identity:WorldIdentity;records:Map<string,ColdRecord>}>();
 protected saved?:{data:SavedExpedition;records:ColdRecord[]};
 constructor(readonly budget=COLD_BUDGET){}
 private world(w:WorldIdentity){let v=this.worlds.get(w.id);if(!v){v={identity:structuredClone(w),records:new Map()};this.worlds.set(w.id,v);}if(!same(v.identity,w))throw Error('已过期的远征请求');return v;}
 async read(w:WorldIdentity,cells:SectorKey[]):Promise<ChunkSnapshot[]>{
  const ids=new Set(cells.map(p=>`${w.id}:${cellId(p)}`));const result=[...this.world(w).records.values()].filter(r=>ids.has(r.id)||r.sites.some(s=>ids.has(s)));result.forEach(verify);return structuredClone(result);
 }
 private stage(w:WorldIdentity,s:ChunkSnapshot[]){const v=this.world(w),next=new Map(v.records);for(const a of s){const r=record(w,a);next.set(r.id,r);}return next;}
 async write(w:WorldIdentity,s:ChunkSnapshot[]):Promise<ColdStats>{
  const next=this.stage(w,s),bytes=[...next.values()].reduce((n,r)=>n+r.bytes,0);
  if(bytes+(this.saved?.data.world.id===w.id?this.saved.data.bytes:0)>this.budget)throw Error('远征存储已达 64 MiB 预算；请先导出或恢复上次保存，或开始新远征');
  this.world(w).records=next;return {bytes,records:next.size};
 }
 async save(w:WorldIdentity,s:ChunkSnapshot[],manifest:string):Promise<void>{
  const next=this.stage(w,s),records=[...next.values()],bytes=records.reduce((n,r)=>n+r.bytes,0),savedBytes=bytes+payloadBytes(manifest);
  if(bytes+savedBytes>this.budget)throw Error('保存需要保留上一代状态，超过远征 64 MiB 预算');
  this.world(w).records=next;this.saved={data:{world:structuredClone(w),manifest,bytes:savedBytes},records:structuredClone(records)};
 }
 async restore(validate?:(manifest:string,world:WorldIdentity)=>boolean):Promise<SavedExpedition|undefined>{
  if(!this.saved)return;if(validate&&!validate(this.saved.data.manifest,this.saved.data.world))throw Error('保存清单损坏或版本未知，未覆盖远征');this.saved.records.forEach(verify);const data=structuredClone(this.saved.data),old=this.worlds.get(data.world.id);
  data.world.epoch=(old?.identity.epoch??data.world.epoch)+1;
  this.worlds.set(data.world.id,{identity:structuredClone(data.world),records:new Map(structuredClone(this.saved.records).map(r=>[r.id,r]))});return data;
 }
}
const request=<T>(r:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error??Error('浏览器存储拒绝请求'));});
interface WorldMeta {identity:WorldIdentity;bytes:number;records:number}
/** IndexedDB atomically commits records, index entries, budget and K manifest.
 * Separate saved records retain the last successful K even after further travel. */
export class IndexedDBExpeditionStore implements ExpeditionStore {
 private db?:Promise<IDBDatabase>;
 constructor(readonly name='the-last-ark.exploration.v3',readonly budget=COLD_BUDGET){}
 private open(){return this.db??=new Promise<IDBDatabase>((resolve,reject)=>{
  const r=indexedDB.open(this.name,1);
  r.onupgradeneeded=()=>{const d=r.result,records=d.createObjectStore('records',{keyPath:'id'});records.createIndex('sites','sites',{multiEntry:true});records.createIndex('world','world');d.createObjectStore('saved',{keyPath:'id'});d.createObjectStore('meta');};
  r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result);};r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('存储升级被其他窗口阻塞'));
 });}
 private async transaction<T>(names:string[],mode:IDBTransactionMode,run:(t:IDBTransaction)=>Promise<T>):Promise<T>{
  const db=await this.open(),tx=db.transaction(names,mode);let value:T;
  const done=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??Error('存储事务中断，原保存仍保留'));tx.onerror=()=>{};});
  try{value=await run(tx);}catch(e){try{tx.abort();}catch{}await done.catch(()=>{});throw e;}
  await done;return value;
 }
 private async meta(tx:IDBTransaction,w:WorldIdentity):Promise<WorldMeta>{
  const m=await request(tx.objectStore('meta').get(w.id)) as WorldMeta|undefined;
  if(m&&(!Number.isSafeInteger(m.bytes)||m.bytes<0||m.bytes>this.budget||!Number.isSafeInteger(m.records)||m.records<0))throw Error('远征容量清单损坏');
  if(m&&!same(m.identity,w))throw Error('已过期的远征请求');return m??{identity:w,bytes:0,records:0};
 }
 async read(w:WorldIdentity,cells:SectorKey[]):Promise<ChunkSnapshot[]>{return this.transaction(['records','meta'],'readonly',async tx=>{
  await this.meta(tx,w);const store=tx.objectStore('records'),rows=new Map<string,ColdRecord>();
  await Promise.all(cells.map(async c=>{const id=`${w.id}:${cellId(c)}`,direct=await request(store.get(id)) as ColdRecord|undefined;if(direct)rows.set(direct.id,direct);for(const r of await request(store.index('sites').getAll(id)) as ColdRecord[])rows.set(r.id,r);}));
  const result=[...rows.values()];result.forEach(verify);return result;
 });}
 private async stage(tx:IDBTransaction,w:WorldIdentity,s:ChunkSnapshot[]):Promise<WorldMeta>{
  const meta=await this.meta(tx,w),store=tx.objectStore('records');
  for(const snapshot of s){const r=record(w,snapshot),old=await request(store.get(r.id)) as ColdRecord|undefined;if(old)verify(old);meta.bytes+=r.bytes-(old?.bytes??0);if(!old)meta.records++;await request(store.put(r));}
  return meta;
 }
 async write(w:WorldIdentity,s:ChunkSnapshot[]):Promise<ColdStats>{return this.transaction(['records','meta'],'readwrite',async tx=>{
  const meta=await this.stage(tx,w,s),saved=await request(tx.objectStore('meta').get('save')) as SavedExpedition|undefined;
  if(meta.bytes+(saved?.world.id===w.id?saved.bytes:0)>this.budget)throw Error('远征存储已达 64 MiB 预算；请先导出或恢复上次保存，或开始新远征');
  await request(tx.objectStore('meta').put(meta,w.id));return {bytes:meta.bytes,records:meta.records};
 });}
 async save(w:WorldIdentity,s:ChunkSnapshot[],manifest:string):Promise<void>{return this.transaction(['records','saved','meta'],'readwrite',async tx=>{
  const meta=await this.stage(tx,w,s),bytes=meta.bytes+payloadBytes(manifest);
  if(meta.bytes+bytes>this.budget)throw Error('保存需要保留上一代状态，超过远征 64 MiB 预算');
  const rows=await request(tx.objectStore('records').index('world').getAll(w.id)) as ColdRecord[];rows.forEach(verify);
  await request(tx.objectStore('saved').clear());for(const row of rows)await request(tx.objectStore('saved').put(row));
  await request(tx.objectStore('meta').put(meta,w.id));await request(tx.objectStore('meta').put({world:w,manifest,bytes} satisfies SavedExpedition,'save'));
 });}
 async restore(validate?:(manifest:string,world:WorldIdentity)=>boolean):Promise<SavedExpedition|undefined>{return this.transaction(['records','saved','meta'],'readwrite',async tx=>{
  const m=tx.objectStore('meta'),saved=await request(m.get('save')) as SavedExpedition|undefined;if(!saved)return;
  if(validate&&!validate(saved.manifest,saved.world))throw Error('保存清单损坏或版本未知，未覆盖远征');
  const rows=await request(tx.objectStore('saved').getAll()) as ColdRecord[];rows.forEach(verify);
  const previous=await request(m.get(saved.world.id)) as WorldMeta|undefined;
  const world={...saved.world,epoch:(previous?.identity.epoch??saved.world.epoch)+1},store=tx.objectStore('records');
  for(const id of await request(store.index('world').getAllKeys(world.id)))await request(store.delete(id));
  for(const row of rows)await request(store.put(row));
  await request(m.put({identity:world,bytes:rows.reduce((n,r)=>n+r.bytes,0),records:rows.length} satisfies WorldMeta,world.id));
  return {...saved,world};
 });}
}
let browserStore:ExpeditionStore|undefined;
export function defaultExpeditionStore():ExpeditionStore {return typeof indexedDB==='undefined'?new MemoryExpeditionStore():(browserStore??=new IndexedDBExpeditionStore());}
