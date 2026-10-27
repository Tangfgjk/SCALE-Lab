"use strict";
const assert=require('node:assert/strict');
const {base}=require('./test-environment');
const {pool}=require('../db/pool');
const {readMembers}=require('../modules/members/public');
const {configuration}=require('../config');
async function main(){
  let queries=0;const db={query(...args){queries++;return pool.query(...args)}};
  const members=await readMembers(db,'zh');assert(queries<=2);queries=0;
  if(members.length){assert.equal((await readMembers(db,'zh',{slug:members[0].slug,includeDetails:true})).length,1);assert(queries<=2)}
  assert.throws(()=>configuration({NODE_ENV:'production'}));
  assert.throws(()=>configuration({TRUST_PROXY:'true'}));
  let cookie='',csrf='';
  async function api(route,method='GET',data){const r=await fetch(base+route,{method,headers:{'content-type':'application/json',cookie,'x-csrf-token':csrf,'x-forwarded-proto':'https'},body:data?JSON.stringify(data):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return{r,...await r.json()}}
  const session=await api('/api/admin/v1/session','POST',{login:process.env.ADMIN_LOGIN,password:process.env.ADMIN_PASSWORD});csrf=session.data.csrfToken;assert(!session.r.headers.get('set-cookie').includes('Secure'),'Untrusted forwarded headers cannot control development cookies');
  const marker='pagination-'+Date.now();
  for(const [category,limit] of [['news',500],['activity',1000]]){
    const draft={slug:marker+'-'+category,locale:'zh',category,title:'摘要边界',summary:'字'.repeat(limit),body:'边界测试正文',happenedAt:'2026-10-27'};
    const allowed=await api('/api/admin/v1/news','POST',draft);assert.equal(allowed.r.status,201);
    assert.equal((await api('/api/admin/v1/news','POST',{...draft,slug:draft.slug+'-over',summary:draft.summary+'字'})).r.status,400);
    if(category==='activity')assert.equal((await api('/api/admin/v1/news/'+allowed.data.id+'/draft','PUT',{...draft,category:'news',expectedVersion:allowed.data.version})).r.status,400);
  }
  for(let i=0;i<12;i++){
    const created=await api('/api/admin/v1/news','POST',{slug:marker+'-'+i,title:marker+' '+i,summary:'分页测试',body:'全文不能出现在列表',happenedAt:'2026-10-27',category:'news',locale:'zh'});
    assert.equal(created.r.status,201,JSON.stringify(created));
    for(const action of ['check','publish'])assert.equal((await api('/api/admin/v1/news/'+created.data.id+'/'+action,'POST',{expectedVersion:created.data.version,locale:'zh'})).r.status,200);
  }
  const first=await api('/api/v1/news?q='+marker+'&pageSize=5');const second=await api('/api/v1/news?q='+marker+'&pageSize=5&page=2');const last=await api('/api/v1/news?q='+marker+'&pageSize=5&page=3');
  assert.equal(first.meta.total,12);assert.equal(first.meta.pages,3);assert.equal(last.data.length,2);assert.equal(new Set([...first.data,...second.data,...last.data].map(x=>x.slug)).size,12);assert(first.data.every(x=>!('body'in x)&&!('richText'in x)));
  assert.equal((await api('/api/v1/news?page=-1')).r.status,400);assert.equal((await api('/api/v1/news?pageSize=101')).r.status,400);assert.equal((await api('/api/v1/news?year=2025&q='+marker)).meta.total,0);
  assert.equal((await api('/api/v1/news/'+first.data[0].slug)).data.body,'全文不能出现在列表');
  assert((await api('/api/v1/home')).data.latestNews.length<=3);
  console.log('PASS public contracts: bounded member queries, paginated search/no full bodies, direct details, production validation and proxy trust');
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>pool.end());
