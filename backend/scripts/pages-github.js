"use strict";
// Use the existing Git Credential Manager session, keeping credentials out of files/logs.
const {spawnSync} = require('node:child_process');
const repository = 'Tangfgjk/SCALE-Lab';
async function main() {
  const credential = spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'}});
  if (credential.status !== 0) throw new Error('GitHub credential unavailable; sign in to Git Credential Manager.');
  const password = credential.stdout.split(/\r?\n/).find(line=>line.startsWith('password='))?.slice(9);
  if (!password) throw new Error('No GitHub credential');
  async function api(method,route,body) {
    const response = await fetch(`https://api.github.com/repos/${repository}${route}`,{method,headers:{Authorization:`Bearer ${password}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},body:body?JSON.stringify(body):undefined});
    const text = await response.text();
    let result; try {result=JSON.parse(text)} catch {result={}};
    return {status:response.status,data:result};
  }
  const current = await api('GET','/pages');
  if (process.argv.includes('--enable')) {
    if (current.status === 404) {
      const created = await api('POST','/pages',{source:{branch:'gh-pages',path:'/'},build_type:'legacy'});
      console.log(JSON.stringify({status:created.status,url:created.data.html_url,message:created.data.message}));
      if (created.status !== 201) process.exitCode=1;
    } else if(current.status === 200 && current.data.source?.branch === 'gh-pages') console.log(JSON.stringify({status:current.status,url:current.data.html_url,build:current.data.status}));
    else throw new Error('Existing Pages configuration differs; refusing to overwrite.');
  } else {
    const repositoryInfo=await api('GET','');
    const builds = current.status === 200 ? await api('GET','/pages/builds/latest') : null;
    console.log(JSON.stringify({repositoryStatus:repositoryInfo.status,private:repositoryInfo.data.private,pagesStatus:current.status,url:current.data.html_url,source:current.data.source,build:current.data.status,latestBuild:builds?.data.status,error:builds?.data.error,message:current.data.message}));
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
