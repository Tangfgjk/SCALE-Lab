"use strict";
// Explicitly sourced records only. Existing records are never overwritten.
const fs=require('node:fs/promises'),path=require('node:path');
const base=process.env.IMPORT_ORIGIN||'http://127.0.0.1:3004';
const records=[
  {slug:'patent-zl2022110343356',title:'融合学习认知要素的可解释知识认知水平挖掘方法及系统',authors:'王志锋, 左明章, 罗恒, 孙建文, 闵秋莎, 董石, 田元, 夏丹, 龙陶陶',number:'ZL2022110343356',source:'2064'},
  {slug:'patent-zl2021112635072',title:'多模态的统一智能学习诊断建模方法、系统、介质、终端',authors:'王志锋, 严文星, 王艳凤, 左明章, 罗恒, 闵秋莎, 董石, 田元, 夏丹, 叶俊民',number:'ZL2021112635072',source:'2063'}
];
let cookie='',csrf='';
async function api(route,method='GET',body){const r=await fetch(base+route,{method,headers:{cookie,'x-csrf-token':csrf,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const json=await r.json();if(!r.ok)throw Error(r.status+': '+JSON.stringify(json));return json.data}
async function main(){
  if(!process.env.ADMIN_LOGIN||!process.env.ADMIN_PASSWORD)throw Error('Provide administrator credentials through environment variables');
  csrf=(await api('/api/admin/v1/session','POST',{login:process.env.ADMIN_LOGIN,password:process.env.ADMIN_PASSWORD})).csrfToken;
  const before=await api('/api/v1/publications?locale=zh'),existing=new Map();
  for(const item of before)existing.set(item.slug,await api('/api/v1/publications/'+item.slug));
  const report=[];
  for(const item of records){
    const found=await api('/api/admin/v1/publications?scope=all&q='+encodeURIComponent(item.slug));
    if(found.some(row=>row.slug===item.slug)){report.push({slug:item.slug,action:'skipped-existing'});continue}
    const sourceUrl='https://faculty.ccnu.edu.cn/wangzhifeng/zh_CN/zlcg/236818/content/'+item.source+'.htm';
    const row=await api('/api/admin/v1/publications','POST',{slug:item.slug,locale:'zh',title:item.title,authors:item.authors,year:2025,achievementType:'patent',summary:'专利编号：'+item.number+'；来源著录年份：2025。',body:'本条信息依据华中师范大学王志锋教师主页专利成果记录整理。\n\n来源页面未单独注明专利类型、当前法律状态、申请日和授权日，本站暂不推断。页面发布时间 2026-06-15 不作为专利授权日期。',sourceUrl,sourceNote:'2026-10-28 核对教师主页详情；用户已确认该主页可用于本网站。本次只采纳名称、发明人顺序、编号及年份。',externalUrl:sourceUrl,metadata:{patentType:'unspecified',patentStatus:'unspecified',patentNumber:item.number,keywords:[]},documents:[],links:[],featured:false});
    for(const action of ['check','publish'])await api('/api/admin/v1/publications/'+row.id+'/'+action,'POST',{expectedVersion:1,locale:'zh'});
    report.push({slug:item.slug,action:'published',sourceUrl});
  }
  for(const [slug,data] of existing)if(JSON.stringify(await api('/api/v1/publications/'+slug))!==JSON.stringify(data))throw Error('Existing record changed: '+slug);
  const directory=path.resolve(__dirname,'../storage/import-reports');await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,'academic-patents-20261028.json'),JSON.stringify({at:new Date().toISOString(),unchangedExisting:existing.size,report},null,2));
  console.log(JSON.stringify({unchangedExisting:existing.size,report}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
