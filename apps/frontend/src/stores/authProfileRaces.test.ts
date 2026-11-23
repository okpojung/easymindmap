// Run with VITE_SUPABASE_URL=https://auth.invalid node scripts/run-vite-test.mjs src/stores/authProfileRaces.test.ts
// Vite supplies import.meta.env. All state and responses are synthetic; no fetch is allowed.
import assert from 'node:assert/strict';
const values = new Map<string,string>();
let writes = 0, failAt = Infinity;
Object.defineProperty(globalThis, 'localStorage', { configurable:true, value:{
  get length() { return values.size; }, key:(i:number)=>Array.from(values.keys())[i] ?? null,
  getItem:(k:string)=>values.get(k)??null,
  setItem:(k:string,v:string)=>{ if (++writes === failAt) throw new Error('synthetic storage failure'); values.set(k,v); },
  removeItem:(k:string)=>values.delete(k),
}});
globalThis.fetch = async () => { throw new Error('Unexpected fetch'); };
const {useAuthStore: auth, captureAuthIdentity: capture, isAuthIdentityCurrent: current, getFreshAccessToken: token, authEnabled} = await import('./authStore');
const {useProfileStore: profiles, reconcileSignupPhone: reconcile} = await import('./profileStore');
const {stashPendingProfile: stash, readPendingProfile: pending, clearPendingProfile, markClaimAttempted} = await import('./pendingProfile');
const {supabaseAuth: api} = await import('@/services/cloud/supabaseAuth');
const {cloudApi: cloud} = await import('@/services/cloud/apiClient');
assert.ok(authEnabled, 'Set VITE_SUPABASE_URL=https://auth.invalid for this offline test');
api.signOut = async () => {};
cloud.recordLogin = async () => {};
const account=(userId:string)=>({userId,email:userId+'@example.invalid',accessToken:'synthetic',refreshToken:'synthetic',expiresAt:0});
const profile=(fullName:string)=>({fullName, phoneCountry:'+82',phoneNumber:'01000000000',phoneVerifiedAt:null,languageReady:false});
const login=(uid:string)=>auth.getState().setSession(account(uid));
function deferred<T=any>() {let resolve!:(x:T)=>void, reject!:(x:Error)=>void;const promise=new Promise<T>((y,n)=>{resolve=y;reject=n});return {promise,resolve,reject};}
let count=0;
const pass=(s:string)=>{count++; console.log('PASS '+s);};
for (const target of ['logout','other','same']) for(const failure of [false,true]) {
  login('A'); const first=capture(); const d=deferred(); let n=0; api.refresh=()=>{n++;return d.promise};
  const a=token(), b=token(); assert.equal(n,1);
  await auth.getState().signOut(); if(target!=='logout')login(target==='other'?'B':'A');
  const expected=auth.getState().session; assert.equal(current(first),false);
  if(failure)d.reject(new Error('late')); else d.resolve(account('A'));
  assert.deepEqual(await Promise.all([a,b]),[null,null]);assert.equal(auth.getState().session,expected);
  pass('late refresh '+(failure?'failure':'success')+' after '+target);
}
login('A'); const rotating=capture();api.refresh=async()=>({...account('A'),accessToken:'rotated'});assert.equal(await token(),'rotated');assert.ok(current(rotating));pass('rotation keeps generation');
for(const method of ['signIn','signUp'] as const){const d=deferred();api[method]=()=>d.promise; const old=auth.getState()[method]('unused','unused');login('B');d.resolve(account('A'));await assert.rejects(old);assert.equal(auth.getState().session?.userId,'B');pass('late '+method+' cannot replace B');}
login('A');const a=deferred(),b=deferred();let calls=0;cloud.getProfile=()=>++calls===1?a.promise:b.promise;
const old=profiles.getState().load();login('B');const next=profiles.getState().load();assert.equal(calls,2);a.resolve(profile('A'));assert.equal(await old,null);const joined=profiles.getState().load();assert.equal(calls,2);b.resolve(profile('B'));await Promise.all([next,joined]);assert.equal(profiles.getState().profile?.fullName,'B');pass('new account has independent load; stale finally cannot clear it');
login('A');const intent={email:account('A').email,fullName:'A',phoneCountry:'+82',phoneNumber:'01000000000',phoneIntent:'test-handle',expiresAt:Date.now()+60000};const record=stash(intent)!;
const saving=deferred(), started=deferred();cloud.getProfile=async()=>profile('');cloud.saveProfile=()=>{started.resolve(null);return saving.promise};const loading=profiles.getState().load();await started.promise;await auth.getState().signOut();login('A');const newer=stash({...intent,fullName:'New'});saving.resolve(profile('A'));assert.equal(await loading,null);clearPendingProfile(record);assert.equal(pending(intent.email)?.key,newer?.key);assert.equal(profiles.getState().profile,null);pass('same-UID relogin discards delayed save and protects newer pending record');
for(const failure of [false,true]) {login('A'); const id=capture();const claiming=deferred();let reads=0;cloud.getProfile=async()=>{reads++;return profile('B')};const operation=reconcile(intent,()=>current(id),()=>claiming.promise);login('B');if(failure)claiming.reject(new Error('late'));else claiming.resolve(null);assert.equal(await operation,null);assert.equal(reads,0);pass('late claim '+(failure?'failure':'success')+' cannot read another account');}
for(const matches of [true,false]){cloud.getProfile=async()=>({...profile('A'),phoneNumber:matches?intent.phoneNumber:'01000000001',phoneVerifiedAt:'server-time'});const r=await reconcile(intent,()=>true,async()=>{throw new Error('response lost')});assert.equal(r?.verified,matches ? true : undefined);pass('ambiguous claim requires exact persisted phone: '+matches);}
cloud.getProfile=async()=>{throw new Error('offline')};assert.equal(await reconcile(intent,()=>true,async()=>{}),null);pass('ambiguous claim/read failure yields unknown, not unverified');
login('A');stash({...intent,readOnly:true});await profiles.getState().load();assert.ok(profiles.getState().error);assert.equal(pending(intent.email)?.data.readOnly,true);cloud.getProfile=async()=>({...profile('A'),phoneVerifiedAt:'server-time'});await profiles.getState().load({force:true});assert.equal(pending(intent.email),null);assert.equal(profiles.getState().profile?.phoneVerifiedAt,'server-time');pass('readback-only pending survives offline, resolves without another claim');
const forB={...intent,email:account('B').email,fullName:'B'};const pb=stash(forB);const pa=stash(intent);clearPendingProfile(pa!);assert.equal(pending(forB.email)?.key,pb?.key);pass('clearing A cannot clear pending B in another tab');
// A different DB connection still sees the old row while the claim is committing.
login('A');const active=stash(intent)!;assert.ok(markClaimAttempted(active));let claimCount=0, committed=false;
cloud.getProfile=async()=>({...profile('A'),phoneVerifiedAt:committed?'server-time':null});
const firstRead=await reconcile(intent,()=>true,async()=>{claimCount++;throw new Error('timeout while committing')});
assert.equal(firstRead,null);await profiles.getState().load({force:true});assert.equal(profiles.getState().profile,null);assert.ok(profiles.getState().error);assert.equal(pending(intent.email)?.data.readOnly,true);
committed=true;await profiles.getState().load({force:true});assert.equal(profiles.getState().profile?.phoneVerifiedAt,'server-time');assert.equal(pending(intent.email),null);assert.equal(claimCount,1);pass('negative GET after timeout stays unknown; later committed row resolves without another claim');
const pendingKeys=()=>[...values.keys()].filter(k=>k.startsWith('emm.pendingProfile'));
clearPendingProfile(pb!);assert.deepEqual(pendingKeys(),[]);
writes=0;failAt=2;const atomic=stash(intent);assert.ok(atomic);assert.equal(writes,1);assert.deepEqual(pendingKeys(),[atomic.key]);
const failed=stash({...intent,fullName:'never stored'});assert.equal(failed,null);assert.deepEqual(pendingKeys(),[atomic.key]);clearPendingProfile(atomic);assert.deepEqual(pendingKeys(),[]);failAt=Infinity;pass('no second index write, failed replacement leaves no orphan or email key');
const oldKey='emm.pendingProfile.item.'+crypto.randomUUID();values.set(oldKey,JSON.stringify(intent));values.set('emm.pendingProfile.current.'+intent.email,oldKey.split('.').pop()!);values.set('emm.pendingProfile.current.orphan@example.invalid','missing');const migrated=pending(intent.email)!;assert.equal(migrated.key,oldKey);assert.deepEqual(pendingKeys(),[oldKey]);clearPendingProfile(migrated);assert.deepEqual(pendingKeys(),[]);pass('migration drops active and dangling email aliases and leaves zero residue after clear');
console.log(`${count} offline race regressions passed`);
