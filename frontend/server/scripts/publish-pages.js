"use strict";
// Keep deployment commits/index separate from the working development branch.
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname,'../../..');
const storage = path.join(root,'frontend/server/storage');
const output = path.join(storage,'pages-preview');
const gitDir = path.join(storage,'pages-deployment.git');
const remote = 'https://github.com/Tangfgjk/SCALE-Lab.git';
function run(args, cwd=root, allowFailure=false) {
  const result=spawnSync('git',args,{cwd,encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'}});
  if(result.status!==0 && !allowFailure) throw new Error(result.stderr.trim() || 'Git command failed');
  return result.stdout.trim();
}
function deployGit(args) {return run([`--git-dir=${gitDir}`,`--work-tree=${output}`,...args]);}
try {
  if(!fs.existsSync(path.join(output,'snapshot-manifest.json'))) throw new Error('Run export-pages.js and review preview first.');
  if(!fs.existsSync(gitDir)) run(['init','--bare',gitDir]);
  deployGit(['symbolic-ref','HEAD','refs/heads/gh-pages']);
  const head = run(['ls-remote','--heads',remote,'gh-pages']);
  if(head) {
    deployGit(['fetch',remote,'gh-pages']);
    deployGit(['update-ref','refs/heads/gh-pages',head.split(/\s/)[0]]);
  }
  for(const name of ['user.name','user.email']) {
    const value=run(['config','--get',name]);
    if(!value) throw new Error(`Missing git ${name}`);
    deployGit(['config',name,value]);
  }
  deployGit(['add','--all','--','.']);
  const changes=deployGit(['status','--porcelain']);
  if(changes) deployGit(['commit','-m','deploy: 发布已公开内容的静态展示快照']);
  console.log(deployGit(['push',remote,'refs/heads/gh-pages:refs/heads/gh-pages']));
  console.log(JSON.stringify({branch:'gh-pages',commit:deployGit(['rev-parse','HEAD'])}));
} catch(error) {console.error(error.message);process.exitCode=1;}
