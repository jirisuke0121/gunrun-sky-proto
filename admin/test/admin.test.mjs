import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT,exportJWK,createLocalJWKSet} from 'jose';
import {DatabaseSync} from 'node:sqlite';
import {verifyOwner} from '../access.js';
import {createAdminWorker} from '../worker.js';
import {extractHeatmap,ownerHeatmap} from '../../server/heatmap.js';
import {selectPoints} from '../public/heatmap.js';
const env={ACCESS_TEAM_DOMAIN:'https://fixture.cloudflareaccess.com',ACCESS_AUD:'fixture-app',OWNER_EMAIL:'owner@example.invalid'};
const keys=await generateKeyPair('RS256'),jwk=await exportJWK(keys.publicKey);jwk.kid='fixture';
const jwks=createLocalJWKSet({keys:[jwk]});
async function token(changes={}){return new SignJWT({email:env.OWNER_EMAIL,type:'app',...changes}).setProtectedHeader({alg:'RS256',kid:'fixture'}).setIssuer(env.ACCESS_TEAM_DOMAIN).setAudience(env.ACCESS_AUD).setSubject('owner').setIssuedAt().setExpirationTime('1h').sign(keys.privateKey)}
const req=(path,t)=>new Request('https://fixture.invalid'+path,{headers:t?{'Cf-Access-Jwt-Assertion':t}:{}});
test('Access verifies signature, issuer, audience, expiration and owner; missing config fails closed',async()=>{
 const valid=await token();assert.equal((await verifyOwner(req('/',valid),env,jwks)).status,200);
 for(const bad of [await token({email:'other@example.invalid'}),valid.slice(0,-8)+'AAAAAAAA',await new SignJWT({email:env.OWNER_EMAIL,type:'app'}).setProtectedHeader({alg:'RS256',kid:'fixture'}).setIssuer('https://other.cloudflareaccess.com').setAudience(env.ACCESS_AUD).setSubject('owner').setIssuedAt().setExpirationTime('1h').sign(keys.privateKey),await new SignJWT({email:env.OWNER_EMAIL,type:'app'}).setProtectedHeader({alg:'RS256',kid:'fixture'}).setIssuer(env.ACCESS_TEAM_DOMAIN).setAudience('other').setSubject('owner').setIssuedAt().setExpirationTime('1h').sign(keys.privateKey),await new SignJWT({email:env.OWNER_EMAIL,type:'app'}).setProtectedHeader({alg:'RS256',kid:'fixture'}).setIssuer(env.ACCESS_TEAM_DOMAIN).setAudience(env.ACCESS_AUD).setSubject('owner').setIssuedAt().setExpirationTime(1).sign(keys.privateKey)])assert.equal((await verifyOwner(req('/',bad),env,jwks)).status,403);
 assert.equal((await verifyOwner(req('/'),env,jwks)).status,401);assert.equal((await verifyOwner(req('/',valid),{},jwks)).status,503);
 const spoof=new Request('https://fixture.invalid/api/players',{headers:{'oai-authenticated-user-id':'fake','oai-authenticated-user-email':env.OWNER_EMAIL,'cf-access-authenticated-user-email':env.OWNER_EMAIL}});assert.equal((await verifyOwner(spoof,env,jwks)).status,401);
});
test('all assets and APIs require verified identity; query forwarding stays bounded',async()=>{
 let calls=0;const worker=createAdminWorker((r,e)=>verifyOwner(r,e,jwks)),bindings={...env,ASSETS:{fetch:()=>{calls++;return new Response('fixture')}}};
 for(const path of ['/','/owner.js','/heatmap-maps.json','/api/heatmap','/api/replay?id=one'])assert.equal((await worker.fetch(req(path),bindings)).status,401);assert.equal(calls,0);
 const t=await token(),page=await worker.fetch(req('/',t),bindings);assert.equal(page.status,200);assert.equal(page.headers.get('cache-control'),'private, no-store');assert.equal(calls,1);
 for(const path of ['/api/heatmap?days=1&days=7','/api/heatmap?endpoint=http://other.invalid','/api/replay?id='+('x'.repeat(65))])assert.equal((await worker.fetch(req(path,t),bindings)).status,400);
 assert.equal((await worker.fetch(req('/missing',t),bindings)).status,404);
 assert.equal((await worker.fetch(req('/api/heatmap',t),bindings)).status,502);
});
const point=(k,life,t=10)=>({k,life,t,at:[-20,8,-4],place:'<img src=x>',near9:4});
const row=(id,changes={})=>({id,received_at:'2026-11-03T00:00:00.000Z',json:JSON.stringify({mapKey:'old-town',build:'release',source:'github',challenge:{id:'hard'},reason:'caught',mistakes:[point('hit',2),point('hit',0)],...changes})});
test('events retain fatal cause, omit invalid points and raw identities; filters do not duplicate deaths',()=>{
 const data=extractHeatmap([row('one'),row('dev',{build:'release-dev'}),row('intro',{challenge:{id:'intro'}}),row('two',{mistakes:[point('fall',1),{k:'hit',at:[null,1,2],t:1}]}),{json:'bad'}]);assert.equal(data.runs.length,2);assert.equal(data.points.length,3);assert.equal(data.points.filter(p=>p.dead).length,1);assert.ok(!JSON.stringify(data).includes('mistakes'));
 const f={map:'old-town',hit:true,fall:true,death:true};assert.equal(selectPoints(data,f).length,3);assert.equal(selectPoints(data,{...f,hit:false,fall:false}).length,1);assert.equal(selectPoints(data,{...f,band:'0'}).length,0);assert.equal(selectPoints(data,{...f,time:'30-60'}).length,0);
});
test('live query uses inclusive JST dates, source and newest 200; counts bounded, no schema changes',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE runs(id TEXT,received_at TEXT,build TEXT,json TEXT)');const add=sql.prepare('INSERT INTO runs VALUES(?,?,?,?)');
 for(let i=0;i<202;i++){const r=row(String(i));add.run(r.id,r.received_at,'release',r.json)}
 for(const [id,at,source,build]of [['before','2026-11-02T14:59:59.000Z','github','release'],['edge','2026-11-03T15:00:00.000Z','github','release'],['y8','2026-11-03T01:00:00.000Z','y8','release'],['dev','2026-11-03T01:00:00.000Z','github','release-dev']]){const r=row(id,{source,build});add.run(id,at,build,r.json)}
 const DB={prepare(q){return {bind(...args){return {async all(){return {results:sql.prepare(q).all(...args)}}}}}}};
 const r=await ownerHeatmap({DB},{},new URL('https://fixture/api/heatmap?from=2026-11-03&to=2026-11-03&source=github')),d=await r.json();assert.equal(d.runs.length,200);assert.equal(d.points.length,400);assert.equal(d.truncated,true);assert.ok(d.runs.every(r=>!['before','edge','y8','dev'].includes(r.id)));assert.equal(r.headers.get('cache-control'),'private, no-store');
 assert.equal((await ownerHeatmap({DB},{},new URL('https://fixture/api/heatmap?source=bad'))).status,400);sql.close();
});
