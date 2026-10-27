"use strict";
const {spawn}=require('node:child_process');
const path=require('node:path');
const crypto=require('node:crypto');
const fs=require('node:fs');
const {Client}=require('pg');
const root=path.resolve(__dirname,'..');
const url=new URL(process.env.DATABASE_URL||'');
if(!/_test$/.test(url.pathname))throw Error('Isolated test database name must end with _test');
const env={...process.env,NODE_ENV:'test',PORT:process.env.TEST_PORT||'4104',HOST:'127.0.0.1',ADMIN_LOGIN:'ci_admin',ADMIN_PASSWORD:crypto.randomBytes(20).toString('hex'),MEDIA_ROOT:path.join(root,'storage/test-runs',crypto.randomUUID())};
env.TEST_BASE_URL='http://127.0.0.1:'+env.PORT;
if(env.PORT==='3004')throw Error('Test server must not use the real website port');
function run(file,expected=0){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[file],{cwd:root,env,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===expected?resolve():reject(Error(file+' failed: '+code)))})}
async function main(){
  const client=new Client({connectionString:env.DATABASE_URL});await client.connect();
  try{if((await client.query("SELECT 1 FROM pg_tables WHERE schemaname='public' LIMIT 1")).rowCount)throw Error('Use a fresh empty test database; this runner never clears existing databases')}finally{await client.end()}
  await run('db/migrate.js');await run('db/migrate.js');
  const migrationClient=new Client({connectionString:env.DATABASE_URL});await migrationClient.connect();
  const sql=fs.readFileSync(path.join(root,'db/migrations/001_core.sql'),'utf8').replace(/\r\n/g,'\n');
  const digest=text=>crypto.createHash('sha256').update(text).digest('hex');
  try{
    await migrationClient.query("UPDATE schema_migrations SET checksum=$1 WHERE filename='001_core.sql'",[digest(sql.replace(/\n/g,'\r\n'))]);
    await run('db/migrate.js');
    await migrationClient.query("UPDATE schema_migrations SET checksum=$1 WHERE filename='001_core.sql'",['invalid-test-checksum']);
    await run('db/migrate.js',1);
    await migrationClient.query("UPDATE schema_migrations SET checksum=$1 WHERE filename='001_core.sql'",[digest(sql)]);
  }finally{await migrationClient.end()}
  await run('scripts/bootstrap-admin.js');
  const server=spawn(process.execPath,['platform.js'],{cwd:root,env,stdio:'inherit'});
  try{
    let ready=false;
    for(let i=0;i<50;i++){try{const r=await fetch(env.TEST_BASE_URL+'/api/health');if(r.ok&&(await r.json()).environment==='test'){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,200))}
    if(!ready)throw Error('Isolated server not ready');
    for(const file of ['news-smoke','news-workflow-smoke','news-bilingual-smoke','news-media-smoke','news-activity-smoke','member-smoke','member-photo-smoke','member-bilingual-smoke','member-details-smoke','research-smoke','research-bilingual-smoke','settings-smoke','accounts-smoke','content-list-smoke','public-contract-smoke'])await run('tests/'+file+'.js');
  }finally{server.kill();await new Promise(resolve=>{if(server.exitCode!==null)resolve();else server.once('exit',resolve)})}
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
