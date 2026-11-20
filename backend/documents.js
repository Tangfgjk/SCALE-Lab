"use strict";
const express=require('express'),multer=require('multer'),crypto=require('node:crypto');
const fs=require('node:fs/promises'),path=require('node:path');const {Worker}=require('node:worker_threads');
const {pool,transaction}=require('./db/pool');const {requireUser,requireCsrf}=require('./auth');const {mediaRoot}=require('./media');
const admin=express.Router(),publicApi=express.Router();
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const fail=(status,message)=>Object.assign(Error(message),{status,code:'DOCUMENT_INVALID'});
const clean=(v,max=200)=>String(v||'').trim().slice(0,max+1);
const shape=`id,display_name AS "displayName",original_name AS "originalName",folder,bytes,pages,sha256,document_version AS "documentVersion",source_note AS "sourceNote",public_allowed AS "publicAllowed",evidence_note AS "evidenceNote",status,created_at AS "createdAt"`;
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024,files:1,fields:8}}).single('file');
function uploadOne(req,res,next){upload(req,res,error=>error?next(fail(error.code==='LIMIT_FILE_SIZE'?413:400,'PDF 不能超过 25 MB，且每次只能上传一个文件')):next())}
function filePath(key){if(!/^documents\/\d{4}\/\d{2}\/[a-f0-9-]{36}\.pdf$/.test(key))throw fail(500,'文档路径无效');return path.join(mediaRoot,...key.split('/'))}
async function inspect(bytes){
  if(!bytes.subarray(0,8).toString('ascii').match(/^%PDF-1\.[0-9]|^%PDF-2\.0/)||!bytes.subarray(-2048).includes(Buffer.from('%%EOF')))throw fail(400,'文件不是完整的 PDF');
  return new Promise((resolve,reject)=>{
    const worker=new Worker(path.join(__dirname,'modules/research/pdf-worker.js'),{workerData:bytes,resourceLimits:{maxOldGenerationSizeMb:128}});
    let done=false;const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);worker.terminate();error?reject(error):resolve(result)};
    const timer=setTimeout(()=>finish(fail(400,'PDF 解析超时，请使用更简单的静态 PDF')),8000);
    worker.once('message',result=>finish(result.error?fail(400,'PDF 无法接收：'+result.error):null,result));
    worker.once('error',()=>finish(fail(400,'PDF 无法解析或结构过于复杂')));worker.once('exit',code=>{if(!done)finish(fail(400,'PDF 解析进程提前结束：'+code))});
  });
}
admin.use(requireUser);
admin.get('/',wrap(async(req,res)=>{
  const page=Number(req.query.page||1),pageSize=Number(req.query.pageSize||10),q=clean(req.query.q),status=req.query.status||'';
  if(!Number.isSafeInteger(page)||page<1||page>100000||!Number.isInteger(pageSize)||pageSize<1||pageSize>100||q.length>200||!['','pending','active','disabled'].includes(status))throw fail(400,'分页或筛选条件无效');
  const filter="FROM documents WHERE ($1='' OR strpos(lower(display_name||' '||original_name||' '||folder),lower($1))>0) AND ($2='' OR status=$2)";
  const total=Number((await pool.query('SELECT count(*) '+filter,[q,status])).rows[0].count);
  res.json({data:(await pool.query('SELECT '+shape+' '+filter+' ORDER BY created_at DESC,id DESC LIMIT $3 OFFSET $4',[q,status,pageSize,(page-1)*pageSize])).rows,meta:{total,page,pageSize}});
}));
admin.post('/',requireCsrf,uploadOne,wrap(async(req,res)=>{
  const file=req.file,sourceNote=clean(req.body.sourceNote,2000),name=clean(req.body.displayName),folder=clean(req.body.folder||'未分类',100),documentVersion=req.body.documentVersion||'other';
  if(!file||!file.originalname.toLowerCase().endsWith('.pdf')||file.mimetype!=='application/pdf')throw fail(400,'请选择 PDF 文件');
  if(!sourceNote||sourceNote.length>2000||name.length>200||folder.length>100||!['submitted','accepted','published','certificate','other'].includes(documentVersion))throw fail(400,'请填写来源，并检查文档资料');
  const parsed=await inspect(file.buffer),sha=crypto.createHash('sha256').update(file.buffer).digest('hex');
  const prior=(await pool.query('SELECT '+shape+' FROM documents WHERE sha256=$1',[sha])).rows[0];if(prior)return res.json({data:{...prior,reused:true}});
  const now=new Date(),key=`documents/${now.getUTCFullYear()}/${String(now.getUTCMonth()+1).padStart(2,'0')}/${crypto.randomUUID()}.pdf`;
  await fs.mkdir(path.dirname(filePath(key)),{recursive:true});await fs.writeFile(filePath(key),file.buffer,{flag:'wx'});
  try{
    const row=await transaction(async client=>{
      const result=(await client.query(`INSERT INTO documents(storage_key,sha256,original_name,display_name,folder,bytes,pages,document_version,source_note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(sha256) DO NOTHING RETURNING ${shape}`,[key,sha,path.basename(file.originalname).slice(0,200),name||path.basename(file.originalname).slice(0,200),folder,file.size,parsed.pages,documentVersion,sourceNote,req.admin.id])).rows[0];
      if(!result)return null;
      await client.query("INSERT INTO audit_events(actor_id,action,detail_json) VALUES($1,'document.upload',$2)",[req.admin.id,JSON.stringify({documentId:result.id,sha256:sha})]);return result;
    });
    if(!row){await fs.unlink(filePath(key));return res.json({data:{...(await pool.query('SELECT '+shape+' FROM documents WHERE sha256=$1',[sha])).rows[0],reused:true}})}
    res.status(201).json({data:row});
  }catch(error){await fs.unlink(filePath(key)).catch(()=>{});throw error}
}));
admin.get('/:id/usage',wrap(async(req,res)=>res.json({data:(await pool.query(`SELECT i.slug,i.type,r.version,p.locale AS "publishedLocale" FROM research_revision_documents a JOIN content_revisions r ON r.id=a.revision_id JOIN content_items i ON i.id=r.content_id LEFT JOIN content_publications p ON p.revision_id=r.id WHERE a.document_id=$1 ORDER BY r.version DESC`,[req.params.id])).rows})));
admin.put('/:id',requireCsrf,wrap(async(req,res)=>{
  const displayName=clean(req.body.displayName),sourceNote=clean(req.body.sourceNote,2000),folder=clean(req.body.folder||'未分类',100);
  if(!displayName||displayName.length>200||!sourceNote||sourceNote.length>2000||folder.length>100)throw fail(400,'请检查文档名称、位置和来源');
  const row=await transaction(async client=>{const row=(await client.query(`UPDATE documents SET display_name=$2,source_note=$3,folder=$4,updated_at=now() WHERE id=$1 RETURNING ${shape}`,[req.params.id,displayName,sourceNote,folder])).rows[0];if(!row)throw fail(404,'文档不存在');await client.query("INSERT INTO audit_events(actor_id,action,detail_json) VALUES($1,'document.update',$2)",[req.admin.id,JSON.stringify({documentId:row.id})]);return row});res.json({data:row});
}));
admin.post('/:id/access',requireCsrf,wrap(async(req,res)=>{
  const allowed=req.body.publicAllowed,status=req.body.status,evidence=clean(req.body.evidenceNote,2000);
  if(typeof allowed!=='boolean'||!['pending','active','disabled'].includes(status)||evidence.length>2000||(allowed&&!evidence)||(status==='active'&&!allowed))throw fail(400,'启用公开 PDF 需记录公开许可依据；未获许可可保存在后台');
  const row=await transaction(async client=>{const row=(await client.query(`UPDATE documents SET public_allowed=$2,status=$3,evidence_note=$4,updated_at=now() WHERE id=$1 RETURNING ${shape}`,[req.params.id,allowed,status,evidence])).rows[0];if(!row)throw fail(404,'文档不存在');await client.query("INSERT INTO audit_events(actor_id,action,detail_json) VALUES($1,'document.access',$2)",[req.admin.id,JSON.stringify({documentId:row.id,publicAllowed:allowed,status})]);return row});res.json({data:row});
}));
function serve(req,res,row){res.set('Cache-Control','no-store');res.set('Content-Security-Policy',"sandbox; default-src 'none'; frame-ancestors 'self'");res.set('X-Frame-Options','SAMEORIGIN');res.attachment((row.display_name||row.original_name).replace(/[\\/\x00-\x1f\x7f]/g,'_').replace(/\.pdf$/i,'')+'.pdf');if(req.query.download!=='1')res.set('Content-Disposition',res.get('Content-Disposition').replace(/^attachment/,'inline'));res.type('application/pdf').sendFile(filePath(row.storage_key))}
admin.get('/:id/file',wrap(async(req,res)=>{const row=(await pool.query('SELECT storage_key,original_name,display_name FROM documents WHERE id=$1',[req.params.id])).rows[0];if(!row)throw fail(404,'文档不存在');serve(req,res,row)}));
publicApi.get('/publications/:slug/documents/:id/file',wrap(async(req,res)=>{
  const locale=req.query.locale==='en'?'en':'zh';
  const row=(await pool.query(`SELECT d.storage_key,d.original_name,d.display_name FROM documents d JOIN research_revision_documents a ON a.document_id=d.id JOIN content_publications p ON p.revision_id=a.revision_id JOIN content_items i ON i.id=p.content_id WHERE i.type='publication' AND i.slug=$1 AND p.locale=$2 AND d.id=$3 AND a.is_public AND d.public_allowed AND d.status='active'`,[req.params.slug,locale,req.params.id])).rows[0];
  if(!row)throw fail(404,'附件尚未公开或已停用');serve(req,res,row);
}));
module.exports={admin,publicApi};
