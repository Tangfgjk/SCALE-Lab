"use strict";
// Offline paired backups. Same-name migration requires a different verified PostgreSQL cluster.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process'),{Client}=require('pg');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2),mode=args[0];
function option(name){const at=args.indexOf(name);if(at<0)return null;if(!args[at+1]||args[at+1].startsWith('--'))throw Error('Missing option '+name);return args[at+1]}
const container=option('--container');
const media=path.resolve(process.env.MEDIA_ROOT||path.join(root,'storage/media'));
const url=new URL(process.env.DATABASE_URL||'');
const database=decodeURIComponent(url.pathname.slice(1));
const backup=path.resolve(option('--directory')||path.join(root,'storage/backups',new Date().toISOString().replace(/[:.]/g,'-')));
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
function command(tool,extra,fd){
  const credentials=['-U',decodeURIComponent(url.username),'-d',database];
  const argv=container?['exec',...(tool==='pg_restore'?['-i']:[]),container,tool,...credentials,...extra]:[...credentials,...extra];
  const result=spawnSync(container?'docker':tool,argv,{env:{...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGPASSWORD:decodeURIComponent(url.password)},stdio:tool==='pg_dump'?['ignore',fd,'pipe']:[fd,'pipe','pipe']});
  if(result.error||result.status!==0)throw Error(tool+' failed: '+String(result.error?.message||result.stderr||'').slice(0,300));
}
function files(directory,prefix=''){
  if(!fs.existsSync(directory))return [];
  if(fs.lstatSync(directory).isSymbolicLink())throw Error('Symbolic links are not supported');
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    if(entry.isSymbolicLink())throw Error('Symbolic links are not supported');
    const name=prefix+entry.name;
    return entry.isDirectory()?files(path.join(directory,entry.name),name+'/'):[name];
  });
}
function child(directory,name){
  if(typeof name!=='string'||name.includes('\\')||name.includes('\0'))throw Error('Invalid backup path');
  const result=path.resolve(directory,name);
  if(!result.startsWith(path.resolve(directory)+path.sep))throw Error('Invalid backup path');
  return result;
}
async function cluster(client){return (await client.query('SELECT system_identifier::text AS id FROM pg_control_system()')).rows[0].id}
async function inventory(client,format=2){
  if(format===2){await client.query("SET TIME ZONE 'UTC'");await client.query("SET DateStyle='ISO, YMD'");await client.query('SET extra_float_digits=3')}
  const result={};
  for(const {tablename} of (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename COLLATE \"C\"")).rows){
    const quoted='"'+tablename.replace(/"/g,'""')+'"';
    const order=format===2?'row_to_json(t)::text COLLATE "C"':'row_to_json(t)::text';
    result[tablename]=(await client.query(`SELECT count(*)::int AS count,md5(COALESCE(string_agg(row_to_json(t)::text,E'\\n' ORDER BY ${order}),'')) AS digest FROM ${quoted} t`)).rows[0];
  }
  return result;
}
function manifest(){
  const data=JSON.parse(fs.readFileSync(path.join(backup,'manifest.json'),'utf8'));
  if(![1,2].includes(data.format)||!data.files||!data.tables||data.dumpSha256!==hash(fs.readFileSync(path.join(backup,'database.dump'))))throw Error('Invalid dump or manifest');
  const actual=files(path.join(backup,'media')).sort(),expected=Object.keys(data.files).sort();
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Backup media inventory differs');
  for(const [name,digest] of Object.entries(data.files)){
    if(hash(fs.readFileSync(child(path.join(backup,'media'),name)))!==digest)throw Error('Invalid media checksum');
  }
  return data;
}
async function prepare(client,data){
  if(database===data.database){
    if(!data.source?.clusterId||await cluster(client)===data.source.clusterId)throw Error('Refusing restore to source database or unverified same-name target');
  }
  if(Object.keys(await inventory(client,data.format)).length)throw Error('Restore target database must have no public tables');
  if(files(media).length)throw Error('Restore target media directory must be empty');
}
async function sameDatabase(client,data){
  if(JSON.stringify(await inventory(client,data.format))!==JSON.stringify(data.tables))throw Error('Database inventory differs from backup');
}
function copyMedia(data){
  if(files(media).length)throw Error('Restore target media directory must be empty');
  fs.mkdirSync(media,{recursive:true});
  for(const name of Object.keys(data.files)){
    const target=child(media,name);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.copyFileSync(child(path.join(backup,'media'),name),target,fs.constants.COPYFILE_EXCL);
  }
}
function verifyMedia(data){
  if(JSON.stringify(files(media).sort())!==JSON.stringify(Object.keys(data.files).sort()))throw Error('Restored media inventory differs');
  for(const [name,digest] of Object.entries(data.files))if(hash(fs.readFileSync(child(media,name)))!==digest)throw Error('Restored media differs');
}
async function main(){
  if(!['backup','restore','verify','prepare-restore','restore-media'].includes(mode))throw Error('Usage: backup-restore.js backup|restore|verify|prepare-restore|restore-media --directory PATH [--container NAME]');
  const data=mode==='backup'?null:manifest();
  const client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();
  try{
    if(mode==='backup'){
      const others=await client.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend'");
      if(others.rows[0].count)throw Error('Stop application and other database clients before offline backup');
      const clusterId=await cluster(client);
      fs.mkdirSync(path.dirname(backup),{recursive:true,mode:0o700});
      fs.mkdirSync(backup,{recursive:false,mode:0o700});
      const fd=fs.openSync(path.join(backup,'database.dump'),'wx',0o600);
      try{command('pg_dump',['-Fc','--no-owner','--no-acl'],fd)}finally{fs.closeSync(fd)}
      fs.mkdirSync(path.join(backup,'media'));
      const data={format:2,createdAt:new Date().toISOString(),database,source:{clusterId},commit:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8',cwd:root}).stdout.trim(),tables:await inventory(client),files:{}};
      for(const name of files(media)){
        const target=child(path.join(backup,'media'),name);
        fs.mkdirSync(path.dirname(target),{recursive:true});
        fs.copyFileSync(child(media,name),target,fs.constants.COPYFILE_EXCL);
        data.files[name]=hash(fs.readFileSync(target));
      }
      data.dumpSha256=hash(fs.readFileSync(path.join(backup,'database.dump')));
      fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify(data,null,2),{mode:0o600,flag:'wx'});
      console.log(JSON.stringify({backup,format:2,tables:Object.keys(data.tables).length,media:Object.keys(data.files).length}));
      return;
    }
    if(mode==='prepare-restore'||mode==='restore')await prepare(client,data);
    if(mode==='prepare-restore'){console.log(JSON.stringify({prepared:true,emptyTarget:true,differentSource:true}));return}
    if(mode==='restore'){
      const fd=fs.openSync(path.join(backup,'database.dump'),'r');
      try{command('pg_restore',['--exit-on-error','--single-transaction','--no-owner','--no-acl'],fd)}finally{fs.closeSync(fd)}
    }
    await sameDatabase(client,data);
    if(mode==='restore'||mode==='restore-media')copyMedia(data);
    verifyMedia(data);
    console.log(JSON.stringify({mode,verified:true,database,tables:Object.keys(data.tables).length,media:Object.keys(data.files).length}));
  }finally{await client.end()}
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
