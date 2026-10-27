"use strict";
function configuration(env=process.env){
  const production=env.NODE_ENV==='production';
  if(production){
    if(!env.DATABASE_URL||!env.MEDIA_ROOT||!env.PUBLIC_ORIGIN)throw Error('Production requires DATABASE_URL, MEDIA_ROOT and PUBLIC_ORIGIN');
    if(new URL(env.PUBLIC_ORIGIN).protocol!=='https:')throw Error('Production PUBLIC_ORIGIN must use HTTPS');
    if(decodeURIComponent(new URL(env.DATABASE_URL).password).length<12)throw Error('Production database password must have at least 12 characters');
  }
  // Numeric hop counts and wildcard trust are deliberately unsupported.
  const trustProxy=env.TRUST_PROXY?env.TRUST_PROXY.split(',').map(x=>x.trim()):false;
  if(trustProxy&&trustProxy.some(x=>['true','*','0.0.0.0/0','::/0'].includes(x)))throw Error('TRUST_PROXY must name trusted proxy addresses/CIDRs');
  return{production,trustProxy,host:env.HOST||'127.0.0.1',port:Number(env.PORT||3004)};
}
module.exports={configuration};
