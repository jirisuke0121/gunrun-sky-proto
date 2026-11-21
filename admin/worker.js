import {verifyOwner} from './access.js';
import {ownerPlayers,ownerReplay} from '../server/players.js';
import {telemetryOverview} from '../server/telemetry.js';
import {ownerHeatmap} from '../server/heatmap.js';
const scope={overview:['days','build','map','device','source','difficulty','quality','from','to','country','os','browser','cores','memoryGb','model'],players:['days','from','to','source','q','completion','cursor'],player:['days','from','to','source','player','cursor'],replay:['id'],heatmap:['days','from','to','source']};
const headers={'cache-control':'private, no-store','vary':'Cookie','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-src https://jirisuke0121.github.io; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"};
function reply(message,status){return Response.json({error:message},{status,headers})}
export function createAdminWorker(authorize=verifyOwner){return {async fetch(request,env){
  const url=new URL(request.url);
  if(!['GET','HEAD'].includes(request.method))return reply('この操作には対応していません。',405);
  const identity=await authorize(request,env);
  if(identity.status!==200)return reply(identity.status===503?'本人認証の設定が必要です。':'本人のアカウントでログインしてください。',identity.status);
  if(url.pathname.startsWith('/api/')){
    if(request.method!=='GET')return reply('この操作には対応していません。',405);
    const route=url.pathname.slice(5), allowed=scope[route];
    if(!allowed)return reply('ページが見つかりません。',404);
    const seen=new Set();for(const[k,v]of url.searchParams){if(!allowed.includes(k)||seen.has(k)||v.length>(k==='cursor'?200:64))return reply('表示条件を確認してください。',400);seen.add(k)}
    try {
      let result;
      if(route==='players'||route==='player') result=await ownerPlayers(env,{},url,route==='player');
      else if(route==='replay')result=await ownerReplay(env,{},url);
      else if(route==='overview')result=await telemetryOverview(env,{},url);
      else result=await ownerHeatmap(env,{},url);
      if(!result.ok)return reply(result.status===404?'この期間の記録、または再生データがありません。':'表示条件を確認してください。',result.status===400||result.status===404?result.status:502);
      return new Response(result.body,{status:result.status,headers:{...headers,'content-type':'application/json; charset=utf-8'}});
    }catch{return reply('記録を取得できませんでした。時間をおいて更新してください。',502)}
  }
  const paths=new Set(['/','/index.html','/owner.js','/owner.css','/heatmap.js','/heatmap-maps.json']);
  if(!paths.has(url.pathname))return reply('ページが見つかりません。',404);
  const asset=await env.ASSETS.fetch(request);const output=new Response(asset.body,asset);for(const[k,v]of Object.entries(headers))output.headers.set(k,v);return output;
}}}
export default createAdminWorker();
