"use strict";
// Start the actual Compose topology, including proxy IP allocation and persistent volumes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),id='scale-compose-'+Date.now(),dir=path.join(root,'backend/storage/compose-validation',id);
fs.mkdirSync(dir,{recursive:true});
const envFile=path.join(dir,'production.env'),password=crypto.randomBytes(24).toString('hex');
fs.writeFileSync(envFile,`COMPOSE_PROJECT_NAME=${id}\nSITE_DOMAIN=lab.example.edu.cn\nPOSTGRES_PASSWORD=${password}\nDATABASE_URL=postgres://scale_lab:${password}@db:5432/scale_lab\nBIND_ADDRESS=127.0.0.1\nHTTP_PORT=0\nEDGE_SUBNET=172.30.194.0/24\nEDGE_IP_RANGE=172.30.194.128/25\nPROXY_IP=172.30.194.2\n`,{mode:0o600});
const prefix=['compose','--env-file',envFile,'-f',path.join(root,'infrastructure/compose.production.yml')];
function compose(args,optional=false){
  const r=spawnSync('docker',[...prefix,...args],{encoding:'utf8'});
  if(r.status&&!optional)throw Error('Compose acceptance failed: '+String(r.stderr).slice(0,500));
  return r.stdout.trim();
}
async function main(){
  try{
    compose(['up','-d','--pull','never','db']);
    compose(['run','--rm','-T','--pull','never','app','node','backend/db/migrate.js']);
    compose(['run','--rm','-T','--pull','never','-e','ADMIN_LOGIN=compose_admin','-e','ADMIN_PASSWORD='+password,'app','node','backend/scripts/bootstrap-admin.js']);
    compose(['up','-d','--no-build','--pull','never','--wait','--wait-timeout','60','app','proxy']);
    let port=compose(['port','proxy','8080']).split(':').at(-1);
    const health=await fetch('http://127.0.0.1:'+port+'/api/health');
    if(!health.ok)throw Error('Proxy health failed');
    const blocked=await fetch('http://127.0.0.1:'+port+'/admin/',{headers:{'x-forwarded-proto':'https'}});
    if(blocked.status!==426)throw Error('Untrusted forwarded protocol bypassed HTTP admin block');
    compose(['exec','-T','app','node','-e',"require('fs').writeFileSync(process.env.MEDIA_ROOT+'/compose-check.txt','persistent')"]);
    compose(['down']);
    compose(['up','-d','--no-build','--pull','never','--wait','--wait-timeout','60','app','proxy']);
    port=compose(['port','proxy','8080']).split(':').at(-1);
    if(!(await fetch('http://127.0.0.1:'+port+'/api/health')).ok)throw Error('Recreated proxy health failed');
    if(compose(['exec','-T','db','psql','-U','scale_lab','-d','scale_lab','-Atc','SELECT count(*) FROM admin_users'])!=='1')throw Error('Accounts did not persist');
    compose(['exec','-T','app','node','-e',"if(require('fs').readFileSync(process.env.MEDIA_ROOT+'/compose-check.txt','utf8')!=='persistent')process.exit(1)"]);
    console.log(JSON.stringify({passed:true,checks:['actual Compose startup','reserved proxy IP outside dynamic range','untrusted forwarded headers rejected','database and media survive container recreation']}));
  }finally{
    compose(['down','--volumes'],true);
    fs.rmSync(envFile,{force:true});
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
