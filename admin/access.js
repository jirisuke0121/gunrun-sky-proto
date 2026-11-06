import {createRemoteJWKSet, jwtVerify} from 'jose';
const caches=new Map();
export async function verifyOwner(request,env,localKeys) {
  const issuer=env.ACCESS_TEAM_DOMAIN, audience=env.ACCESS_AUD, email=env.OWNER_EMAIL;
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer||'') || !audience || !email) return {status:503};
  const token=request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return {status:401};
  try {
    let keys=localKeys || caches.get(issuer);
    if(!keys){keys=createRemoteJWKSet(new URL(issuer+'/cdn-cgi/access/certs'));caches.set(issuer,keys)}
    const {payload}=await jwtVerify(token,keys,{issuer,audience,algorithms:['RS256'],requiredClaims:['exp','iat','sub','email']});
    if(payload.type!=='app'||String(payload.email).toLowerCase()!==email.toLowerCase())return {status:403};
    return {status:200};
  }catch{return {status:403}}
}
