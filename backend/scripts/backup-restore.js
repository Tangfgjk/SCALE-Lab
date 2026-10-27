"use strict";
// Offline, paired database/media backups. Restore only into an empty, different database.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const {Client} = require('pg');
const root=path.resolve(__dirname,'..');
const args=process.argv.slice(2), mode=args[0];
const option=name=>args[args.indexOf(name)+1];
const container=args.includes('--container')?option('--container'):null;
const media=path.resolve(process.env.MEDIA_ROOT || path.join(root,'storage/media'));
const url=new URL(process.env.DATABASE_URL || '');
const database=decodeURIComponent(url.pathname.slice(1));
const backup=path.resolve(args.includes('--directory')?option('--directory'):path.join(root,'storage/backups',new Date().toISOString().replace(/[:.]/g,'-')));
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
function command(tool,extra,fd) {
  const credentials=['-U',decodeURIComponent(url.username),'-d',database];
  const executable=container?'docker':tool;
  const argv=container?['exec',...(tool==='pg_restore'?['-i']:[]),container,tool,...credentials,...extra]:[...credentials,...extra];
  const result=spawnSync(executable,argv,{env:{...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGPASSWORD:decodeURIComponent(url.password)},stdio:tool==='pg_dump'?['ignore',fd,'pipe']:[fd,'pipe','pipe']});
  if(result.status!==0) throw Error(`${tool} failed: ${String(result.stderr || '').slice(0,300)}`);
}
function files(directory,prefix='') {
  if(!fs.existsSync(directory))return [];
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    if(entry.isSymbolicLink())throw Error('Symbolic links are not supported in backups');
    const name=prefix+entry.name;
    return entry.isDirectory()?files(path.join(directory,entry.name),name+'/'):[name];
  });
}
async function inventory(client) {
  const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  const result={};
  for(const {tablename} of tables){
    const quoted='"'+tablename.replace(/"/g,'""')+'"';
    result[tablename]=(await client.query(`SELECT count(*)::int AS count, md5(COALESCE(string_agg(row_to_json(t)::text,E'\\n' ORDER BY row_to_json(t)::text),'')) AS digest FROM ${quoted} t`)).rows[0];
  }
  return result;
}
async function main(){
  if(!['backup','restore','verify'].includes(mode))throw Error('Usage: backup-restore.js backup|restore|verify --directory PATH [--container NAME]; set DATABASE_URL and MEDIA_ROOT');
  const client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();
  try{
    if(mode==='backup'){
      const others=await client.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend'");
      if(others.rows[0].count)throw Error('Stop the application and other database clients before offline backup');
      fs.mkdirSync(backup,{recursive:false,mode:0o700});
      const fd=fs.openSync(path.join(backup,'database.dump'),'wx',0o600);
      try{command('pg_dump',['-Fc','--no-owner','--no-acl'],fd)}finally{fs.closeSync(fd)}
      fs.mkdirSync(path.join(backup,'media'));
      const manifest={format:1,createdAt:new Date().toISOString(),database,commit:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8',cwd:root}).stdout.trim(),tables:await inventory(client),files:{}};
      for(const name of files(media)){
        const source=path.join(media,name),target=path.join(backup,'media',name);
        fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
        manifest.files[name]=hash(fs.readFileSync(target));
      }
      manifest.dumpSha256=hash(fs.readFileSync(path.join(backup,'database.dump')));
      fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600,flag:'wx'});
      console.log(JSON.stringify({backup,tables:Object.keys(manifest.tables).length,media:Object.keys(manifest.files).length}));
    }else{
      const manifest=JSON.parse(fs.readFileSync(path.join(backup,'manifest.json')));
      if(manifest.format!==1 || manifest.dumpSha256!==hash(fs.readFileSync(path.join(backup,'database.dump'))))throw Error('Invalid dump or manifest');
      for(const [name,digest] of Object.entries(manifest.files)){
        const source=path.resolve(backup,'media',name);
        if(!source.startsWith(path.resolve(backup,'media')+path.sep) || hash(fs.readFileSync(source))!==digest)throw Error('Invalid media checksum/path');
      }
      if(mode==='restore'){
        if(database===manifest.database)throw Error('Refusing restore to source database');
        if(Object.keys(await inventory(client)).length)throw Error('Restore target database must have no public tables');
        if(files(media).length)throw Error('Restore target media directory must be empty');
        const fd=fs.openSync(path.join(backup,'database.dump'),'r');
        try{command('pg_restore',['--exit-on-error','--single-transaction','--no-owner','--no-acl'],fd)}finally{fs.closeSync(fd)}
        fs.mkdirSync(media,{recursive:true});
        for(const name of Object.keys(manifest.files)){const target=path.join(media,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(backup,'media',name),target,fs.constants.COPYFILE_EXCL)}
      }
      if(JSON.stringify(await inventory(client))!==JSON.stringify(manifest.tables))throw Error('Database inventory differs from backup');
      for(const [name,digest] of Object.entries(manifest.files))if(hash(fs.readFileSync(path.join(media,name)))!==digest)throw Error('Restored media differs');
      console.log(JSON.stringify({mode,verified:true,database,media:Object.keys(manifest.files).length}));
    }
  }finally{await client.end()}
}
// Parent is deliberately created separately; incomplete backup folders have no valid manifest.
if(mode==='backup')fs.mkdirSync(path.dirname(backup),{recursive:true,mode:0o700});
main().catch(error=>{console.error(error.message);process.exitCode=1});
