"use strict";
const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
let count=0;
function walk(root){for(const entry of fs.readdirSync(root,{withFileTypes:true})){if(['node_modules','storage','.git'].includes(entry.name))continue;const file=path.join(root,entry.name);if(entry.isDirectory())walk(file);else if(/\.(js|mjs)$/.test(file)){const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);count++}}}
walk('backend');walk('frontend');console.log('Syntax checks passed: '+count+' files');
