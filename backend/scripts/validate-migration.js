"use strict";
// Disposable PostgreSQL clusters; never connect to the laboratory database.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {Client}=require('pg');
const root=path.resolve(__dirname,'..'),id='scale-migration-'+Date.now();
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'scale-migration-'));
const source=id+'-source',target=id+'-target',password=crypto.randomBytes(24).toString('hex');
function docker(args){const r=spawnSync('docker',args,{encoding:'utf8'});if(r.status!==0)throw Error('Docker migration check failed: '+String(r.stderr).slice(0,300));return r.stdout.trim()}
function run(file,env,args=[],success=true){
  const r=spawnSync(process.execPath,[file,...args],{cwd:root,env:{...process.env,...env},encoding:'utf8'});
  if(success&&r.status!==0)throw Error(file+' failed: '+r.stderr);
  if(!success&&r.status===0)throw Error(file+' should have refused this operation');
}
async function ready(url){for(let n=0;n<60;n++){const c=new Client({connectionString:url});try{await c.connect();await c.end();return}catch{await c.end().catch(()=>{});await new Promise(r=>setTimeout(r,250))}}throw Error('Migration test PostgreSQL not ready')}
async function main(){
  try{
    const urls={};
    for(const name of [source,target]){
      docker(['run','-d','--name',name,'-e','POSTGRES_USER=scale_lab','-e','POSTGRES_DB=scale_lab','-e','POSTGRES_PASSWORD='+password,'-p','127.0.0.1::5432','postgres:17.11']);
      const port=docker(['port',name,'5432/tcp']).split(':').at(-1);
      urls[name]='postgres://scale_lab:'+password+'@127.0.0.1:'+port+'/scale_lab';
      await ready(urls[name]);
    }
    const sourceMedia=path.join(directory,'source-media'),targetMedia=path.join(directory,'target-media'),backup=path.join(directory,'backup');
    fs.mkdirSync(sourceMedia);fs.writeFileSync(path.join(sourceMedia,'migration-fixture.txt'),'Synthetic media\n');
    const src={DATABASE_URL:urls[source],MEDIA_ROOT:sourceMedia,NODE_ENV:'test'};
    const dst={DATABASE_URL:urls[target],MEDIA_ROOT:targetMedia,NODE_ENV:'test'};
    run('db/migrate.js',src);
    run('scripts/bootstrap-admin.js',{...src,ADMIN_LOGIN:'admin',ADMIN_PASSWORD:'admin'});
    run('scripts/backup-restore.js',src,['backup','--container',source,'--directory',backup]);
    run('scripts/backup-restore.js',src,['prepare-restore','--directory',backup],false);
    run('scripts/backup-restore.js',dst,['prepare-restore','--directory',backup]);
    run('scripts/backup-restore.js',dst,['restore','--container',target,'--directory',backup]);
    run('scripts/backup-restore.js',dst,['verify','--directory',backup]);
    run('scripts/backup-restore.js',dst,['restore','--container',target,'--directory',backup],false);
    fs.writeFileSync(path.join(targetMedia,'migration-fixture.txt'),'Tampered');
    run('scripts/backup-restore.js',dst,['verify','--directory',backup],false);
    fs.copyFileSync(path.join(sourceMedia,'migration-fixture.txt'),path.join(targetMedia,'migration-fixture.txt'));
    run('scripts/backup-restore.js',dst,['verify','--directory',backup]);
    const strong=crypto.randomBytes(24).toString('hex');
    run('scripts/provision-production-accounts.js',{...dst,NODE_ENV:'production',ADMIN_PASSWORD:strong,AUDIT_PASSWORD:crypto.randomBytes(24).toString('hex')},['--apply']);
    const c=new Client({connectionString:urls[target]});await c.connect();
    try{
      const users=(await c.query("SELECT i.provider_subject AS login,u.role FROM admin_users u JOIN admin_identities i ON i.user_id=u.id ORDER BY login")).rows;
      if(JSON.stringify(users)!==JSON.stringify([{login:'admin',role:'admin'},{login:'scale_audit',role:'content_manager'}]))throw Error('Production account setup differs');
    }finally{await c.end()}
    console.log(JSON.stringify({passed:true,checks:['same-name cross-cluster restore','source database refused','nonempty target refused','paired data/media checksums','tampered media detected','production admin rotation','restricted audit account']}));
  }finally{
    for(const name of [source,target])spawnSync('docker',['rm','-f','-v',name],{stdio:'ignore'});
    if(!directory.startsWith(path.join(os.tmpdir(),'scale-migration-')))throw Error('Unexpected temporary directory');
    fs.rmSync(directory,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
