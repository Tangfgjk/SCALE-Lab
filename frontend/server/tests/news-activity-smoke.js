"use strict";
const assert=require("node:assert/strict");
const sharp=require("sharp");
const base=process.env.TEST_BASE_URL || "http://127.0.0.1:3004";
let cookie="",csrf="",id,assetId,version=1;
async function request(path,method="GET",value,expected=200){
  const multipart=value instanceof FormData;
  const res=await fetch(base+path,{method,headers:{cookie,"x-csrf-token":csrf,...(multipart?{}:{"content-type":"application/json"})},body:value===undefined?undefined:multipart?value:JSON.stringify(value)});
  if(res.headers.get("set-cookie")) cookie=res.headers.get("set-cookie").split(";")[0];
  const json=await res.json();assert.equal(res.status,expected,JSON.stringify(json));return json.data;
}
async function main(){
  csrf=(await request("/api/admin/v1/session","POST",{login:process.env.ADMIN_LOGIN,password:process.env.ADMIN_PASSWORD})).csrfToken;
  const list=await request('/api/v1/news'),activities=await request('/api/v1/activities');
  try {
    await request('/api/admin/v1/activities','POST',{},410);
    const image=new FormData();image.set('file',new Blob([await sharp({create:{width:20,height:20,channels:3,background:'#357a80'}}).png().toBuffer()],{type:'image/png'}),'activity-test.png');
    image.set('altZh','合成测试图片');image.set('altEn','Synthetic test image');image.set('credit','自动化测试');image.set('sourceNote','本地合成图片，不含人物');
    assetId=(await request('/api/admin/v1/assets','POST',image,201)).id;
    const slug='smoke-unified-activity-'+Date.now();
    const richText={type:'doc',schemaVersion:1,content:[{type:'paragraph',content:[{type:'text',text:'活动前段'}]},{type:'image',attrs:{assetId,caption:'图片说明',width:'medium',align:'left'}},{type:'paragraph',content:[{type:'text',text:'活动后段'}]}]};
    let draft={slug,locale:'zh',title:'统一图文测试',summary:'活动测试摘要',happenedAt:'2026-10-20',category:'activity',location:'测试地点',richText};
    id=(await request('/api/admin/v1/news','POST',draft,201)).id;
    const endpoint='/api/admin/v1/news/'+id;
    let saved=await request(endpoint);assert.equal(saved.category,'activity');assert.equal(saved.location,draft.location);assert.equal(saved.media[assetId].available,false);
    await request('/api/v1/news/'+slug,'GET',undefined,404);
    assert(!(await request('/api/v1/activities')).some(x=>x.slug===slug));
    await request(endpoint+'/check','POST',{expectedVersion:version,locale:'zh'},409);
    for(const type of ['copyright','people']) await request('/api/admin/v1/assets/'+assetId+'/clearances','POST',{type,allowed:true,evidenceNote:'本地合成色块，不含人物'});
    await request('/api/admin/v1/assets/'+assetId+'/activate','POST',{});
    async function publish(locale='zh'){
      await request(endpoint+'/check','POST',{expectedVersion:version,locale});
      await request(endpoint+'/publish','POST',{expectedVersion:version,locale});
    }
    await publish();
    const published=(await request('/api/v1/activities')).find(x=>x.slug===slug);
    assert.equal(published.cover.id,assetId,'First body image is a fallback cover');assert.equal(published.images[0].caption,'图片说明');
    assert.equal(published.location,'测试地点');assert.equal(published.activityDate,draft.happenedAt);assert.equal(published.richText.content[1].attrs.width,'medium');
    assert(!(await request('/api/v1/news')).some(x=>x.slug===slug));
    assert(!(await request('/api/v1/home')).latestNews.some(x=>x.slug===slug));
    assert.equal((await request('/api/v1/activities/'+slug)).category,'activity');
    assert.equal((await request('/api/v1/news/'+slug)).category,'activity');
    assert((await request('/api/admin/v1/news?category=activity&q='+slug)).some(x=>x.id===id));
    assert(!(await request('/api/admin/v1/news?category=news&q='+slug)).some(x=>x.id===id));
    const en={...draft,locale:'en',title:'Activity English',summary:'English summary'};
    await request(endpoint+'/draft','PUT',{...en,expectedVersion:version});version++;await publish('en');
    assert((await request('/api/v1/activities?locale=en')).some(x=>x.slug===slug));
    // Changing the draft destination leaves the old published destination intact.
    draft={...draft,category:'news',title:'已改为新闻'};
    await request(endpoint+'/draft','PUT',{...draft,expectedVersion:version});version++;
    assert((await request('/api/v1/activities')).some(x=>x.slug===slug));
    assert(!(await request('/api/v1/news')).some(x=>x.slug===slug));
    await publish();
    assert(!(await request('/api/v1/activities')).some(x=>x.slug===slug));
    assert((await request('/api/v1/news')).some(x=>x.slug===slug));
    await request('/api/v1/activities/'+slug,'GET',undefined,404);
    assert(!(await request('/api/v1/activities?locale=en')).some(x=>x.slug===slug),'Chinese destination change invalidates stale English');
    await request('/api/admin/v1/assets/'+assetId+'/disable','POST',{});
    assert.equal((await request('/api/v1/news/'+slug)).media[assetId],undefined);
    console.log('PASS unified activity/news: draft isolation, media gates, rich text, body-image cover fallback, destinations, type filter, English invalidation and media disable');
  } finally {
    if(id){const item=await request('/api/admin/v1/news/'+id);if(item.published) await request('/api/admin/v1/news/'+id+'/withdraw','POST',{expectedVersion:item.version,locale:'zh'});}
    if(assetId) await request('/api/admin/v1/assets/'+assetId+'/disable','POST',{});
  }
  assert.deepEqual(await request('/api/v1/news'),list);assert.deepEqual(await request('/api/v1/activities'),activities);
  console.log('PASS cleanup: existing public news and activities unchanged');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
