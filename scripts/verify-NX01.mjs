/** Run: node --experimental-vm-modules scripts/verify-NX01.mjs
 * Production store/queue/rules with simulated browser persistence and network.
 * Requires installed TypeScript. Does not execute PostgreSQL or a physical camera.
 */
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const ts = createRequire(import.meta.url)('typescript')
const root = fileURLToPath(new URL('../', import.meta.url))
const storage = new Map(), photos = new Map()
let diskError = false, photoError = false, remoteError = null, photoDelay = null
let remoteCalls = 0
const localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k,v) => { if (diskError) throw Error('Quota exceeded'); storage.set(k,v) },
  removeItem: (k) => storage.delete(k),
}
const context = vm.createContext({ console, crypto: globalThis.crypto, Date, Intl, Math, JSON, setTimeout, clearTimeout,
  localStorage, navigator: { onLine: false }, structuredClone, atob, btoa, DOMException })
const create = (initializer) => {
  let state
  const subscribers = new Set()
  const get = () => state
  const set = (value) => { state = { ...state, ...(typeof value === 'function' ? value(state) : value) }; subscribers.forEach(fn=>fn(state)) }
  state = initializer(set,get)
  return Object.assign((selector) => selector(state), { getState: get, setState: set, subscribe: (fn)=>{subscribers.add(fn);return ()=>subscribers.delete(fn)} })
}
const livePath = resolve(root,'src/services/live/liveApi.ts')
const liveSource = readFileSync(livePath,'utf8')
const liveExports = [...liveSource.matchAll(/export (?:async )?function (\w+)/g)].map((m)=>m[1])
const services = Object.fromEntries(liveExports.map((name) => [name, async () => { remoteCalls++; if(remoteError) throw remoteError }]))
const stubs = new Map([
  ['jsbarcode', { default: () => {} }], ['qrcode', { default: {} }], ['zustand', { create }], ['clsx', { clsx: (...v)=>v.join(' ') }], ['tailwind-merge', { twMerge: (v)=>v }],
  [resolve(root,'src/components/ui/toast.tsx'), { toast: { error() {}, success() {} } }],
  [livePath, services],
  [resolve(root,'src/services/evidence/localPhotos.ts'), {
    putLocalPhoto: async (p) => { if(photoDelay) await photoDelay; if(photoError) throw Error('Photo quota exceeded'); photos.set(p.id,structuredClone(p)) },
    getLocalPhoto: async (id) => photos.get(id), removeLocalPhoto: async (id) => { photos.delete(id) },
  }],
])
const cache = new Map()
function moduleFor(id) {
  if(cache.has(id)) return cache.get(id)
  let module
  if(stubs.has(id)) {
    const exports=stubs.get(id)
    module=new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v] of Object.entries(exports)) this.setExport(k,v)},{context,identifier:id})
  } else {
    const code=ts.transpileModule(readFileSync(id,'utf8'),{fileName:id,compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText
    module=new vm.SourceTextModule(code,{context,identifier:id})
  }
  cache.set(id,module);return module
}
function link(spec, ref) {
  if(stubs.has(spec)) return moduleFor(spec)
  let p=spec.startsWith('@/') ? resolve(root,'src',spec.slice(2)) : resolve(dirname(ref.identifier),spec)
  if(!existsSync(p)) p += existsSync(p+'.ts') ? '.ts' : '.tsx'
  return moduleFor(p)
}
const main=moduleFor(resolve(root,'src/store/dataStore.ts'));await main.link(link);await main.evaluate()
const store=main.namespace.useDataStore
const queue=cache.get(resolve(root,'src/services/live/syncQueue.ts')).namespace
const rules=cache.get(resolve(root,'src/lib/photoEvidence.ts')).namespace
const base=structuredClone({ ...store.getState(), ...Object.fromEntries(Object.keys(store.getState()).filter(k=>typeof store.getState()[k]==='function').map(k=>[k,undefined])) })
const goodPhoto=()=>({id:crypto.randomUUID(),capturedAt:new Date().toISOString(),width:640,height:480,dataUrl:'data:image/jpeg;base64,'+Buffer.from([255,216,255,...Array(160).fill(0),255,217]).toString('base64')})
const employee=()=>store.getState().employees.find(e=>e.status==='active')
const input=()=>({employeeId:employee().id,type:'entry',time:'08:00',method:'employee_number',date:'2026-10-07'})
function reset(){
  const values=structuredClone(base)
  for(const k of Object.keys(values))if(values[k]===undefined)delete values[k]
  store.setState({...values,attendance:[],mode:'live'})
  context.navigator.onLine=false
  storage.clear();photos.clear();diskError=false;photoError=false;remoteError=null;photoDelay=null;remoteCalls=0
}
let count=0
async function test(name, fn){reset();await fn();console.log(`OK ${++count}: ${name}`)}
await test('photo required only for entry by number/PIN',()=>{
  assert.equal(rules.needsEntryPhoto('employee_number','entry'),true)
  assert.equal(rules.needsEntryPhoto('pin','entry'),true)
  for(const method of ['qr','barcode','face','manual'])assert.equal(rules.needsEntryPhoto(method,'entry'),false)
  for(const type of ['exit','lunch_in','lunch_out'])assert.equal(rules.needsEntryPhoto('employee_number',type),false)
})
await test('reject stale, future, oversized and non-JPEG evidence',()=>{
  const now=Date.now()
  for(const change of [{capturedAt:new Date(now-91000).toISOString()},{capturedAt:new Date(now+6000).toISOString()},
    {dataUrl:'data:image/png;base64,ABC'},{dataUrl:'data:image/jpeg;base64,/9j/'+ 'A'.repeat(180000)},
    {width:0},{height:900},{id:'invalid'}])assert.throws(()=>rules.validatePhotoCapture({...goodPhoto(),...change},now))
  rules.validatePhotoCapture(goodPhoto(),now)
})
await test('store refuses number entry without durable photo',()=>{
  assert.throws(()=>store.getState().registerPunch(input()),/foto/)
  assert.equal(store.getState().attendance.length,0)
})
await test('forged photo reference cannot bypass local guard',()=>{
  assert.throws(()=>store.getState().registerPunch({...input(),photoEvidence:{id:crypto.randomUUID(),capturedAt:new Date().toISOString()}}),/foto/)
})
await test('offline success persists photo then durable queue and lightweight reference',async()=>{
  const p=goodPhoto();const result=await store.getState().registerPunchWithPhoto(input(),p)
  assert.equal(photos.get(p.id).employeeId,input().employeeId)
  assert.equal(result.punch.photoEvidence.id,p.id)
  assert.equal(queue.readQueue().length,1)
  assert.equal(queue.readQueue()[0].payload.punches[0].photoEvidence.id,p.id)
  assert.equal(JSON.stringify(queue.readQueue()).includes(p.dataUrl),false)
  assert.equal(store.getState().attendance.length,1)
})
await test('image disk failure cannot create attendance',async()=>{
  photoError=true
  await assert.rejects(store.getState().registerPunchWithPhoto(input(),goodPhoto()),/quota/)
  assert.equal(store.getState().attendance.length,0);assert.equal(queue.readQueue().length,0)
})
await test('queue quota failure cannot create attendance or orphan a photo',async()=>{
  diskError=true
  await assert.rejects(store.getState().registerPunchWithPhoto(input(),goodPhoto()),/guardar/)
  assert.equal(store.getState().attendance.length,0);assert.equal(photos.size,0)
})
await test('corrupt queue is preserved and blocks false success',async()=>{
  storage.set('nexotime.syncQueue','broken')
  await assert.rejects(store.getState().registerPunchWithPhoto(input(),goodPhoto()),/cola/)
  assert.equal(storage.get('nexotime.syncQueue'),'broken');assert.equal(photos.size,0)
})
await test('duplicate entry is rejected without deleting the first photo',async()=>{
  const first=goodPhoto();await store.getState().registerPunchWithPhoto(input(),first)
  await assert.rejects(store.getState().registerPunchWithPhoto(input(),goodPhoto()))
  assert.equal(store.getState().attendance.length,1);assert.equal(photos.size,1);assert.ok(photos.has(first.id))
})
await test('inactive employee cannot register or leave an orphan photo',async()=>{
  const i=input();store.setState({employees:store.getState().employees.map(e=>e.id===i.employeeId?{...e,status:'inactive'}:e)})
  await assert.rejects(store.getState().registerPunchWithPhoto(i,goodPhoto()),/inactivo/)
  assert.equal(photos.size,0)
})
await test('out-of-scope employee cannot register with evidence',async()=>{
  store.setState({currentUser:{...store.getState().currentUser,role:'employee',employeeId:'someone-else'}})
  await assert.rejects(store.getState().registerPunchWithPhoto(input(),goodPhoto()),/permiso/)
  assert.equal(photos.size,0)
})
await test('concurrent submit creates only one entry',async()=>{
  let release;photoDelay=new Promise(r=>{release=r})
  const task=store.getState().registerPunchWithPhoto(input(),goodPhoto())
  await assert.rejects(store.getState().registerPunchWithPhoto(input(),goodPhoto()),/guardando/)
  release();await task;assert.equal(store.getState().attendance.length,1)
})
await test('session change during disk write cancels and cleans photo',async()=>{
  let release;photoDelay=new Promise(r=>{release=r})
  const task=store.getState().registerPunchWithPhoto(input(),goodPhoto())
  store.setState({currentUser:{...store.getState().currentUser,id:'other-user'}})
  release();await assert.rejects(task,/sesión/);assert.equal(photos.size,0)
})
await test('later exit preserves entry evidence and updates the same queue item',async()=>{
  const p=goodPhoto();await store.getState().registerPunchWithPhoto(input(),p)
  store.getState().registerPunch({...input(),type:'exit',time:'18:00'})
  const q=queue.readQueue();assert.equal(q.length,1);assert.equal(q[0].payload.punches.length,2)
  assert.equal(q[0].payload.punches[0].photoEvidence.id,p.id)
})
await test('manual correction retains original evidence',async()=>{
  const p=goodPhoto();const result=await store.getState().registerPunchWithPhoto(input(),p)
  const error=store.getState().applyCorrection({recordId:result.record.id,type:'entry',time:'08:01',reason:'Corrección de prueba',actor:store.getState().currentUser})
  assert.ok(!error);assert.equal(store.getState().attendance[0].punches[0].photoEvidence.id,p.id)
})
await test('server rejection keeps photo attendance pending and visible',async()=>{
  await store.getState().registerPunchWithPhoto(input(),goodPhoto())
  context.navigator.onLine=true
  remoteError=Error('RLS rejected')
  for(let i=0;i<7;i++)await queue.flushQueue()
  assert.equal(queue.readQueue().filter(q=>q.kind==='attendance').length,1)
  const loaded=queue.applyPendingWrites({...store.getState(),attendance:[]})
  assert.equal(loaded.attendance.length,1);assert.equal(photos.size,1)
})
await test('network outage retains evidence queue',async()=>{
  await store.getState().registerPunchWithPhoto(input(),goodPhoto())
  remoteError=Error('Failed to fetch')
  await queue.flushQueue();assert.equal(queue.readQueue().length,1)
})
await test('successful remote write acknowledges queue',async()=>{
  await store.getState().registerPunchWithPhoto(input(),goodPhoto())
  const result=await queue.flushQueue();assert.equal(result.sent,1);assert.equal(queue.readQueue().length,0)
})
await test('queued entries cannot be mixed into another company',async()=>{
  await store.getState().registerPunchWithPhoto(input(),goodPhoto())
  const loaded=queue.applyPendingWrites({...store.getState(),company:{id:'other-company'},attendance:[]})
  assert.equal(loaded.attendance.length,0)
})
await test('same millisecond updates keep distinct queue revisions',()=>{
  const payload={companyId:'a',employeeId:'e',date:'2026-10-07',punches:[]}
  queue.enqueue({kind:'attendance',payload},true);const first=queue.readQueue()[0].queuedAt
  queue.enqueue({kind:'attendance',payload},true);assert.ok(queue.readQueue()[0].queuedAt>first)
})
// Exercise the real live API adapter separately, with only HTTP/IndexedDB simulated.
const rpcRequests=[];let rpcFailure=null,upserts=0
const apiClient={
  rpc: async (name, args)=>{rpcRequests.push({name,args});return {data:null,error:rpcFailure?{message:rpcFailure}:null}},
  from: ()=>({upsert: async ()=>{upserts++;return {error:null}}}),
}
stubs.delete(livePath)
stubs.set('@supabase/supabase-js',{createClient:()=>apiClient})
stubs.set(resolve(root,'src/lib/supabaseClient.ts'),{supabase:apiClient})
cache.clear()
const liveModule=moduleFor(livePath);await liveModule.link(link);await liveModule.evaluate()
const api=liveModule.namespace
await test('real API commits attendance and image in one RPC before local cleanup',async()=>{
  const p=goodPhoto();const result=await store.getState().registerPunchWithPhoto(input(),p)
  await api.liveUpsertAttendance(result.record)
  assert.equal(rpcRequests.at(-1).name,'save_attendance_with_photos')
  assert.equal(rpcRequests.at(-1).args.p_photos[0].id,p.id)
  assert.equal(rpcRequests.at(-1).args.p_record.punches[0].photoEvidence.id,p.id)
  assert.equal(photos.has(p.id),false)
})
await test('real API remote failure retains local image',async()=>{
  const p=goodPhoto();const result=await store.getState().registerPunchWithPhoto(input(),p)
  rpcFailure='server failed'
  await assert.rejects(api.liveUpsertAttendance(result.record),/server failed/)
  assert.ok(photos.has(p.id));rpcFailure=null
})
await test('real API refuses mismatched employee evidence before network',async()=>{
  const p=goodPhoto();const result=await store.getState().registerPunchWithPhoto(input(),p)
  photos.get(p.id).employeeId='wrong';const before=rpcRequests.length
  await assert.rejects(api.liveUpsertAttendance(result.record),/corresponde/)
  assert.equal(rpcRequests.length,before)
})
await test('already-uploaded evidence is not re-uploaded with subsequent movements',async()=>{
  const p=goodPhoto();const result=await store.getState().registerPunchWithPhoto(input(),p)
  await api.liveUpsertAttendance(result.record)
  const before=rpcRequests.length
  await api.liveUpsertAttendance(result.record)
  assert.equal(rpcRequests.length,before);assert.ok(upserts>0)
})
console.log(`\n${count} comprobaciones NX01 correctas (persistencia y red simuladas).`)
