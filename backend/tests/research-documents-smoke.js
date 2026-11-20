"use strict";
const assert=require('node:assert/strict');const {PDFDocument,PDFName,PDFString}=require('pdf-lib');const {base}=require('./test-environment');
let cookie='',csrf='';
async function request(route,method='GET',data,expected=200){const multipart=data instanceof FormData;const r=await fetch(base+route,{method,headers:{cookie,'x-csrf-token':csrf,...(multipart?{}:{'content-type':'application/json'})},body:data===undefined?undefined:multipart?data:JSON.stringify(data)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const body=await r.json();assert.equal(r.status,expected,JSON.stringify(body));return body.data}
async function pdf(text,active=false,encrypted=false){const doc=await PDFDocument.create();doc.addPage().drawText(text);if(active)doc.catalog.set(PDFName.of('OpenAction'),doc.context.obj({S:PDFName.of('JavaScript'),JS:PDFString.of('app.alert(1)')}));if(encrypted)doc.context.trailerInfo.Encrypt=doc.context.register(doc.context.obj({Filter:PDFName.of('Standard'),V:1,R:2,Length:40,P:-4,O:PDFString.of('fake-owner'),U:PDFString.of('fake-user')}));return Buffer.from(await doc.save())}
function form(bytes,name='paper.pdf'){const f=new FormData();f.set('file',new Blob([bytes],{type:'application/pdf'}),name);f.set('sourceNote','Synthetic PDF for isolated tests');f.set('displayName',name);return f}
async function publicFile(slug,id,status=200,locale='zh'){const r=await fetch(base+'/api/v1/publications/'+slug+'/documents/'+id+'/file?locale='+locale);assert.equal(r.status,status);if(status===200){assert(r.headers.get('content-type').includes('application/pdf'));assert(r.headers.get('content-disposition').startsWith('inline'));return Buffer.from(await r.arrayBuffer())}}
async function allow(id,publicAllowed=true){return request('/api/admin/v1/documents/'+id+'/access','POST',{publicAllowed,status:publicAllowed?'active':'disabled',evidenceNote:'Synthetic authored PDF; no personal data'})}
async function create(draft){return request('/api/admin/v1/publications','POST',draft,201)}
async function publish(id,version,locale='zh'){for(const action of ['check','publish'])await request('/api/admin/v1/publications/'+id+'/'+action,'POST',{expectedVersion:version,locale})}
async function main(){
  assert.equal((await fetch(base+'/api/admin/v1/documents')).status,401);
  csrf=(await request('/api/admin/v1/session','POST',{login:process.env.ADMIN_LOGIN,password:process.env.ADMIN_PASSWORD})).csrfToken;
  assert.equal((await fetch(base+'/api/admin/v1/documents',{method:'POST',headers:{cookie},body:form(await pdf('csrf'))})).status,403);
  await request('/api/admin/v1/documents','POST',form(Buffer.from('fake PDF')),400);
  await request('/api/admin/v1/documents','POST',form(await pdf('wrong extension'),'file.exe'),400);
  await request('/api/admin/v1/documents','POST',form(await pdf('active',true)),400);
  await request('/api/admin/v1/documents','POST',form(await pdf('encrypted',false,true)),400);
  await request('/api/admin/v1/documents','POST',form(Buffer.alloc(25*1024*1024+1)),413);
  const aBytes=await pdf('First revision'),a=await request('/api/admin/v1/documents','POST',form(aBytes),201),b=await request('/api/admin/v1/documents','POST',form(await pdf('Second revision')),201);
  const duplicate=await request('/api/admin/v1/documents','POST',form(aBytes));assert.equal(duplicate.id,a.id);assert(duplicate.reused);assert.equal(a.pages,1);
  assert.equal((await fetch(base+'/api/admin/v1/documents/'+a.id+'/file')).status,401);
  const slug='smoke-achievement-'+Date.now(),draft={slug,locale:'zh',title:'PDF linked paper',summary:'An isolated achievement',body:'Detailed research explanation',year:2026,authors:'Test Author',venue:'Test Journal',stage:'published',sourceNote:'Synthetic test',achievementType:'paper',metadata:{keywords:['analysis']},documents:[{id:a.id,label:'Author accepted manuscript',isPublic:true}],links:[],featured:true,displayOrder:1};
  const created=await create(draft);await publicFile(slug,a.id,404);
  await request('/api/admin/v1/publications/'+created.id+'/check','POST',{expectedVersion:1});await request('/api/admin/v1/publications/'+created.id+'/publish','POST',{expectedVersion:1},400);
  await request('/api/admin/v1/documents/'+a.id+'/access','POST',{publicAllowed:true,status:'active',evidenceNote:''},400);await allow(a.id);await publish(created.id,1);
  assert((await publicFile(slug,a.id)).equals(aBytes));await publicFile(slug,a.id,404,'en');
  const download=await fetch(base+'/api/v1/publications/'+slug+'/documents/'+a.id+'/file?download=1');assert(download.headers.get('content-disposition').startsWith('attachment'));
  assert.equal((await request('/api/v1/publications/'+slug)).documents.length,1);
  const second={...draft,documents:[{id:b.id,label:'New version',isPublic:true}]};await request('/api/admin/v1/publications/'+created.id+'/draft','PUT',{...second,expectedVersion:1});await publicFile(slug,a.id);await publicFile(slug,b.id,404);
  await allow(b.id);await publish(created.id,2);await publicFile(slug,a.id,404);await publicFile(slug,b.id);
  const sharedSlug=slug+'-shared',shared=await create({...draft,slug:sharedSlug,documents:[{id:b.id,label:'Shared PDF',isPublic:true},{id:a.id,label:'Internal reference',isPublic:false}]});await publish(shared.id,1);assert.equal((await request('/api/v1/publications/'+sharedSlug)).documents.length,1);await publicFile(sharedSlug,a.id,404);
  await request('/api/admin/v1/publications/'+created.id+'/withdraw','POST',{expectedVersion:2,locale:'zh'});await publicFile(slug,b.id,404);await publicFile(sharedSlug,b.id);
  await allow(b.id,false);await publicFile(sharedSlug,b.id,404);assert.equal((await request('/api/v1/publications/'+sharedSlug)).documents.length,0);await allow(b.id);
  const english={...draft,slug:sharedSlug,title:'English paper',locale:'en',documents:[{id:b.id,label:'English PDF',isPublic:true}]};await request('/api/admin/v1/publications/'+shared.id+'/draft','PUT',{...english,expectedVersion:1});await publish(shared.id,2,'en');await publicFile(sharedSlug,b.id,200,'en');
  await request('/api/admin/v1/publications/'+shared.id+'/withdraw','POST',{expectedVersion:2,locale:'zh'});await publicFile(sharedSlug,b.id,404,'en');
  const patent=await create({...draft,slug:slug+'-patent',achievementType:'patent',venue:'',metadata:{patentType:'invention',patentStatus:'granted',applicationNumber:'CN-Test-Application',patentNumber:'CN-Test-Grant',appliedOn:'2025-01-01',grantedOn:'2026-01-01',keywords:[]},documents:[]});await publish(patent.id,1);assert.equal((await request('/api/v1/publications/'+slug+'-patent')).metadata.patentNumber,'CN-Test-Grant');
  const software=await create({...draft,slug:slug+'-software',achievementType:'software',venue:'',metadata:{softwareVersion:'1.0',registrationNumber:'Test-Registration',registeredOn:'2026-01-01'},documents:[]});await publish(software.id,1);assert.equal((await request('/api/v1/publications/'+slug+'-software')).achievementType,'software');
  await request('/api/admin/v1/publications','POST',{...draft,slug:slug+'-invalid',achievementType:'software',metadata:{}},400);
  const result=await(await fetch(base+'/api/v1/publications?type=patent&q=PDF&pageSize=1')).json();assert(result.data.every(x=>x.achievementType==='patent'));assert(result.meta.total>=1);assert(!('body'in result.data[0]));
  assert((await request('/api/admin/v1/documents/'+a.id+'/usage')).length>=1);
  const direction=await request('/api/admin/v1/research-directions','POST',{slug:slug+'-direction',title:'Linked direction',themeNumber:1,areas:[],sourceNote:'Synthetic source'},201);
  for(const action of ['check','publish'])await request('/api/admin/v1/research-directions/'+direction.id+'/'+action,'POST',{expectedVersion:1});
  const linked=await create({...draft,slug:slug+'-linked',documents:[],links:[direction.id],metadata:{keywords:[],codeUrl:'https://example.org/code',demoUrl:'https://example.org/demo'}});await publish(linked.id,1);
  assert.equal((await request('/api/v1/publications/'+slug+'-linked')).links[0].id,direction.id);
  assert((await request('/api/v1/research-directions/'+slug+'-direction')).links.some(x=>x.id===linked.id));
  const filtered=await request('/api/v1/publications?direction='+slug+'-direction');assert(filtered.some(x=>x.slug===slug+'-linked'));
  await request('/api/admin/v1/publications','POST',{...draft,slug:slug+'-bad-url',metadata:{codeUrl:'javascript:alert(1)'}},400);
  await request('/api/admin/v1/research-directions/'+direction.id+'/draft','PUT',{expectedVersion:1,title:'Self link',themeNumber:1,areas:[],sourceNote:'Synthetic',links:[direction.id]},400);
  await request('/api/admin/v1/research-directions/'+direction.id+'/withdraw','POST',{expectedVersion:1});assert.equal((await request('/api/v1/publications/'+slug+'-linked')).links.length,0);
  console.log('PASS academic PDFs: real parsing/type/size/active/encryption rejection, deduplication, private drafts, scoped publication/locale access, revision replacement, shared PDFs, withdrawal/disable, paper/patent/software compatibility and filters');
}
main().catch(error=>{console.error(error);process.exitCode=1});
