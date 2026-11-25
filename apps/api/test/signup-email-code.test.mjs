// Build the API, then: node --test test/signup-email-code.test.mjs
// All addresses and credentials are synthetic; DB, SMTP and HTTP are test doubles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountService } from '../dist/account/account.service.js';
import { AccountController } from '../dist/account/account.controller.js';
const id = '00000000-0000-4000-8000-000000000001', email = 'person@example.invalid';
const registered = {id, email, email_confirmed_at:'2026-01-01T00:00:00Z'};
const origin = 'https://auth.example.invalid';
function fixture(t, opts = {}) {
  const trace = [], reads = [], mail = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    reads.push({url, init}); trace.push('get');
    if (opts.failure) throw new Error('synthetic transport failure');
    return Response.json(opts.user ?? registered, {status:opts.status ?? 200});
  });
  const db = {query:async (sql, params) => {
    if (sql.includes('FROM public.email_verifications')) {trace.push('cooldown'); return {rows:opts.cooldown ?? []};}
    if (sql.includes('FROM auth.users')) {
      trace.push('mirror'); assert.ok(sql.includes('lower(email) = $1 LIMIT 2')); assert.equal(params.length,1);
      assert.ok(!sql.includes('@')); assert.equal(params[0], params[0].toLowerCase().trim());
      if(opts.mirrorFailure) throw new Error('synthetic missing mirror');
      return {rows:opts.mirror ?? [{id}]};
    }
    if (sql.includes('INSERT INTO public.email_verifications')) {trace.push('code'); return {rows:[]};}
    throw new Error('unexpected query');
  }};
  const config = {get:key=>({AUTH_MODE:'supabase',GOTRUE_URL:origin,SUPABASE_JWT_SECRET:'synthetic-signup-test-secret', ...opts.config})[key]};
  const svc = new AccountService(db, {isConfigured:()=>true,sendCode:async (...data)=>{trace.push('mail');mail.push(data);}}, {}, config);
  const ctl = new AccountController(svc, config, {}, {});
  const send = (address = email, ip = '192.0.2.1') => ctl.sendEmailCode({email:address},{ip, headers:{authorization:'Bearer fake-'+address}});
  return {svc, trace, reads, mail, send};
}
test('exact confirmed signup returns contracted 409 without creating or sending a code', async t => {
  const h=fixture(t, {user:{...registered,email:'PERSON@example.invalid'}});
  await assert.rejects(h.send(' Person@Example.Invalid '), e => {
    assert.equal(e.getStatus(),409); assert.deepEqual(e.getResponse(),{code:'EMAIL_ALREADY_REGISTERED',message:'이미 가입된 이메일입니다'});return true;
  });
  assert.deepEqual(h.trace,['cooldown','mirror','get']); assert.deepEqual(h.mail,[]);
  const [{url,init}]=h.reads; assert.equal(url,origin+'/admin/users/'+id);assert.equal(init.method,'GET');
  assert.equal(init.redirect,'error');assert.equal(init.body,undefined);assert.ok(init.signal instanceof AbortSignal);
  assert.ok(init.headers.Authorization.startsWith('Bearer '));
});
for (const [name,opts,want] of [
  ['new address',{mirror:[]},['cooldown','mirror']],
  ['ambiguous mirror',{mirror:[{id},{id}]},['cooldown','mirror']],
  ['invalid mirror ID',{mirror:[{id:'invalid'}]},['cooldown','mirror']],
  ['missing mirror access',{mirrorFailure:true},['cooldown','mirror']],
  ['no trusted admin URL',{config:{GOTRUE_URL:''}},['cooldown','mirror']],
  ['no trusted admin secret',{config:{SUPABASE_JWT_SECRET:''}},['cooldown','mirror']],
  ['unconfirmed mirror while admin is offline',{failure:true,mirror:[{id,confirmed:false}]},['cooldown','mirror','get']],
  ['confirmed but stale mirror (404)',{status:404,mirror:[{id,confirmed:true}]},['cooldown','mirror','get']],
  ['dev auth',{config:{AUTH_MODE:'dev'}},['cooldown']],
  ['pending email, even if phone is confirmed',{user:{...registered,email_confirmed_at:null,confirmed_at:'2026-01-01T00:00:00Z'}},['cooldown','mirror','get']],
  ['changed email',{user:{...registered,email:'different@example.invalid'}},['cooldown','mirror','get']],
  ['mismatched ID',{user:{...registered,id:'different'}},['cooldown','mirror','get']],
  ['soft-deleted account',{user:{...registered,deleted_at:'2026-01-02T00:00:00Z'}},['cooldown','mirror','get']],
  ['invalid confirmation date',{user:{...registered,email_confirmed_at:'invalid'}},['cooldown','mirror','get']],
  ['stale mirror: 404',{status:404},['cooldown','mirror','get']],
  ['admin offline',{failure:true},['cooldown','mirror','get']],
]) test(name+' leaves ordinary email-code flow available', async t => {
  const h=fixture(t,opts);assert.equal((await h.send()).sent,true);assert.deepEqual(h.trace,[...want,'code','mail']);
  assert.equal(h.mail.length,1);assert.equal(h.mail[0][0],email);
});
for (const [name,opts,want] of [
  ['no admin URL',{config:{GOTRUE_URL:''}},['cooldown','mirror']],
  ['no admin secret',{config:{SUPABASE_JWT_SECRET:''}},['cooldown','mirror']],
  ['admin offline',{failure:true},['cooldown','mirror','get']],
  ['admin 500',{status:500},['cooldown','mirror','get']],
]) test('confirmed mirror row blocks the code when GoTrue cannot answer: '+name, async t => {
  const h=fixture(t,{...opts,mirror:[{id,confirmed:true}]});
  await assert.rejects(h.send(), e => e.getStatus()===409 && e.getResponse().code==='EMAIL_ALREADY_REGISTERED');
  assert.deepEqual(h.trace,want); assert.deepEqual(h.mail,[]);
});
test('IP budget precedes every DB/admin call even with different addresses and bearer headers',async t=>{
  const h=fixture(t,{mirror:[]});
  for(let i=0;i<20;i++) await h.send('address'+i+'@example.invalid');
  const before=[...h.trace];await assert.rejects(h.send('extra@example.invalid'),e=>e.getStatus()===429);
  assert.deepEqual(h.trace,before); assert.equal(h.reads.length,0);
});
test('confirmed rejections consume address budget across IPs before any lookup',async t=>{
  const h=fixture(t);for(let i=0;i<5;i++) await assert.rejects(h.send(email,'192.0.2.'+i),e=>e.getStatus()===409);
  const before=[...h.trace];await assert.rejects(h.send(email.toUpperCase(),'192.0.2.8'),e=>e.getStatus()===429);
  assert.deepEqual(h.trace,before);assert.equal(h.mail.length,0);
});
test('persisted mail cooldown still runs before admin check',async t=>{
  const h=fixture(t,{cooldown:[{wait_sec:60,sent_count:1,window_fresh:true}]});
  await assert.rejects(h.send(),e=>e.getStatus()===400);assert.deepEqual(h.trace,['cooldown']);
});
test('password reset and admin mail do not use signup disclosure',async t=>{
  const h=fixture(t);for(const purpose of ['passwordReset','adminLogin'])assert.equal((await h.svc.sendEmailCode(email,false,purpose)).sent,true);
  assert.deepEqual(h.trace,['cooldown','code','mail','cooldown','code','mail']);
});
