"use strict";
// Offline setup on the restored production database. Never run on the local source.
const {pool, transaction}=require('../db/pool');
const {hashPassword, verifyPassword}=require('../auth');
async function main(){
  if(process.env.NODE_ENV!=='production'||!process.argv.includes('--apply'))throw Error('Use NODE_ENV=production and --apply on the restored target only');
  const definitions=[
    {login:process.env.ADMIN_LOGIN||'admin',password:process.env.ADMIN_PASSWORD,role:'admin'},
    {login:process.env.AUDIT_LOGIN||'scale_audit',password:process.env.AUDIT_PASSWORD,role:'content_manager'}
  ];
  if(definitions[0].login===definitions[1].login)throw Error('Administrator and audit logins must be different');
  for(const item of definitions){
    if(!/^[a-z][a-z0-9._-]{2,31}$/.test(item.login))throw Error('Invalid production login');
    if(typeof item.password!=='string'||item.password.length<12||item.password.length>128||!item.password.trim())throw Error('Both production passwords must contain 12–128 characters');
    item.hash=await hashPassword(item.password);
  }
  await transaction(async client=>{
    const existing=(await client.query("SELECT i.provider_subject AS login,c.password_hash FROM admin_identities i JOIN admin_password_credentials c ON c.user_id=i.user_id WHERE i.provider='local'")).rows;
    for(const row of existing)if(!definitions.some(x=>x.login===row.login)){
      for(const weak of ['admin','123456','password'])if(await verifyPassword(weak,row.password_hash))throw Error('Another demonstration account requires password rotation: '+row.login);
    }
    for(const item of definitions){
      let user=(await client.query("SELECT user_id FROM admin_identities WHERE provider='local' AND provider_subject=$1 FOR UPDATE",[item.login])).rows[0];
      if(!user){
        const id=(await client.query('INSERT INTO admin_users(display_name,role) VALUES($1,$2) RETURNING id',[item.login,item.role])).rows[0].id;
        await client.query("INSERT INTO admin_identities(user_id,provider,provider_subject) VALUES($1,'local',$2)",[id,item.login]);
        user={user_id:id};
      }
      await client.query('UPDATE admin_users SET is_active=true,role=$2 WHERE id=$1',[user.user_id,item.role]);
      await client.query('INSERT INTO admin_password_credentials(user_id,password_hash) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET password_hash=EXCLUDED.password_hash,updated_at=now()',[user.user_id,item.hash]);
      await client.query('UPDATE admin_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[user.user_id]);
      await client.query("INSERT INTO audit_events(actor_id,action,detail_json) VALUES($1,'account.production_setup',$2)",[user.user_id,JSON.stringify({login:item.login,role:item.role})]);
    }
  });
  console.log(JSON.stringify({configured:definitions.map(({login,role})=>({login,role})),passwordsPrinted:false}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1}).finally(()=>pool.end());
