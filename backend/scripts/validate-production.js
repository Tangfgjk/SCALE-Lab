"use strict";
// Disposable production-mode containers. Never connect to the laboratory database.
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const image=process.env.VALIDATION_IMAGE||'scale-lab:v5-engineering-20261027';
const root=path.resolve(__dirname,'..'),id='scale-lab-check-'+Date.now();
const database=id+'-db',app=id+'-app',network=id+'-net',pgVolume=id+'-pg',mediaVolume=id+'-media';
const password=crypto.randomBytes(24).toString('hex'),adminPassword=crypto.randomBytes(24).toString('hex');
const directory=path.join(root,'storage/production-validation',id);fs.mkdirSync(directory,{recursive:true});
const envFile=path.join(directory,'production.env');
fs.writeFileSync(envFile,`NODE_ENV=production\nHOST=0.0.0.0\nPORT=3004\nPUBLIC_ORIGIN=https://lab.example.edu.cn\nMEDIA_ROOT=/app/backend/storage/media\nDATABASE_URL=postgres://scale_lab:${password}@db:5432/scale_lab\nADMIN_LOGIN=validation_admin\nADMIN_PASSWORD=${adminPassword}\n`,{mode:0o600});
function docker(args,optional=false){const r=spawnSync('docker',args,{encoding:'utf8'});if(r.status&&!optional)throw Error('Docker validation command failed: '+String(r.stderr).slice(0,200));return r.stdout.trim()}
const common=['--network',network,'--env-file',envFile,'-v',mediaVolume+':/app/backend/storage/media'];
const base='http://127.0.0.1:3104';
async function ready(){for(let i=0;i<60;i++){try{if((await fetch(base+'/api/health')).ok)return}catch{}await new Promise(r=>setTimeout(r,250))}throw Error('Production healthcheck timeout')}
let cookie='',csrf='';
async function api(route,method='GET',data){const multipart=data instanceof FormData;const r=await fetch(base+route,{method,headers:{cookie,'x-csrf-token':csrf,...(multipart?{}:{'content-type':'application/json'})},body:data===undefined?undefined:multipart?data:JSON.stringify(data)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const body=await r.json();if(!r.ok)throw Error('Validation request failed '+r.status+': '+JSON.stringify(body));return{r,...body}}
async function main(){
  try{
    docker(['network','create',network]);
    docker(['run','-d','--name',database,'--network',network,'--network-alias','db','-e','POSTGRES_USER=scale_lab','-e','POSTGRES_DB=scale_lab','-e','POSTGRES_PASSWORD='+password,'-v',pgVolume+':/var/lib/postgresql/data','postgres:17.11']);
    let pgReady=false;for(let i=0;i<60;i++){const r=spawnSync('docker',['exec',database,'pg_isready','-U','scale_lab'],{encoding:'utf8'});if(r.status===0){pgReady=true;break}await new Promise(r=>setTimeout(r,250))}if(!pgReady)throw Error('Validation PostgreSQL timeout');
    for(const script of ['db/migrate.js','scripts/bootstrap-admin.js'])docker(['run','--rm',...common,image,'node','backend/'+script]);
    docker(['run','-d','--name',app,...common,'--read-only','--tmpfs','/tmp:size=64m','--cap-drop','ALL','--security-opt','no-new-privileges:true','-p','127.0.0.1:3104:3004',image]);
    await ready();
    const session=await api('/api/admin/v1/session','POST',{login:'validation_admin',password:adminPassword});csrf=session.data.csrfToken;
    if(!session.r.headers.get('set-cookie').includes('Secure'))throw Error('Production cookie is not Secure');
    if(!session.r.headers.get('content-security-policy')||!session.r.headers.get('strict-transport-security'))throw Error('Missing production headers');
    const forbidden=await fetch(base+'/api/admin/v1/news',{method:'POST',headers:{cookie,'content-type':'application/json'},body:'{}'});if(forbidden.status!==403)throw Error('CSRF protection failed');
    const sharp=require('sharp'),upload=new FormData();upload.set('file',new Blob([await sharp({create:{width:16,height:16,channels:3,background:'#326875'}}).png().toBuffer()],{type:'image/png'}),'check.png');upload.set('sourceNote','Synthetic production validation image');upload.set('altZh','合成测试色块');upload.set('credit','系统生成');
    const asset=(await api('/api/admin/v1/assets','POST',upload)).data;
    for(const type of ['copyright','people'])await api('/api/admin/v1/assets/'+asset.id+'/clearances','POST',{type,allowed:true,evidenceNote:'Synthetic image, no people'});
    await api('/api/admin/v1/assets/'+asset.id+'/activate','POST',{});
    const news=(await api('/api/admin/v1/news','POST',{slug:'production-validation',locale:'zh',title:'Production validation',summary:'Validation summary',body:'Persistent article',happenedAt:'2026-10-27',category:'news',coverAssetId:asset.id})).data;
    for(const action of ['check','publish'])await api('/api/admin/v1/news/'+news.id+'/'+action,'POST',{expectedVersion:news.version,locale:'zh'});
    const before=Buffer.from(await(await fetch(base+'/api/v1/assets/'+asset.id+'/file')).arrayBuffer());
    docker(['restart',app]);await ready();
    if((await api('/api/v1/news/production-validation')).data.body!=='Persistent article')throw Error('Article did not persist');
    const after=await fetch(base+'/api/v1/assets/'+asset.id+'/file');if(!after.ok||!before.equals(Buffer.from(await after.arrayBuffer())))throw Error('Media did not persist');
    for(let i=0;i<6;i++)await fetch(base+'/api/admin/v1/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({login:'blocked-user',password:'wrong'})});
    docker(['restart',app]);await ready();
    const blocked=await fetch(base+'/api/admin/v1/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({login:'blocked-user',password:'wrong'})});if(blocked.status!==429)throw Error('Login limit lost after restart');
    const result={passed:true,image,checkedAt:new Date().toISOString(),checks:['non-root read-only container','production configuration','Secure cookie','CSP/HSTS','CSRF rejection','upload and publish','database and media restart persistence','persistent login limit'],cloudHttpsVerified:false};
    fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{
    // Only names created by this invocation are removed; never touch existing containers/volumes.
    for(const name of [app,database])docker(['rm','-f',name],true);
    docker(['network','rm',network],true);for(const name of [pgVolume,mediaVolume])docker(['volume','rm',name],true);
    fs.rmSync(envFile,{force:true});
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
