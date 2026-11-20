"use strict";
const {richTextOf,plainTextOf,imageIds,uuid}=require('../../rich-text');
const {activeAssets,publicAsset}=require('../../media');
const fail=message=>Object.assign(Error(message),{status:400,code:'INVALID_RESEARCH'});
function normalize(body,kind){
  const richText=richTextOf(body.richText),coverAssetId=body.coverAssetId||null;
  if(coverAssetId&&!uuid.test(coverAssetId))throw fail('封面须从图片库选择');
  const documents=body.documents||[],links=body.links||[];
  if(!Array.isArray(documents)||documents.length>20||documents.some(d=>!d||!uuid.test(d.id)||typeof d.label!=='string'||!d.label.trim()||d.label.length>100||typeof d.isPublic!=='boolean')||new Set(documents.map(d=>d.id)).size!==documents.length)throw fail('附件须选择资源库 PDF、填写名称并指定是否公开，最多 20 个');
  if(kind!=='publication'&&documents.length)throw fail('PDF 附件目前用于学术成果');
  if(!Array.isArray(links)||links.length>50||links.some(id=>!uuid.test(id))||new Set(links).size!==links.length)throw fail('关联资料最多 50 条，须从已存在内容选择');
  const featured=body.featured??false,displayOrder=Number(body.displayOrder||0);
  if(typeof featured!=='boolean'||!Number.isInteger(displayOrder)||displayOrder<0||displayOrder>9999)throw fail('精选或排序无效');
  return{richText,coverAssetId,documents:documents.map(d=>({...d,label:d.label.trim()})),links,featured,displayOrder,...(richText?{body:plainTextOf(richText)}:{})};
}
async function save(client,revisionId,value){
  const ids=[...new Set([value.coverAssetId,...imageIds(value.richText)].filter(Boolean))];
  if(ids.length){const rows=await client.query('SELECT id FROM assets WHERE id=ANY($1::uuid[]) FOR SHARE',[ids]);if(rows.rowCount!==ids.length)throw fail('引用图片不存在');for(const id of ids)await client.query('INSERT INTO research_revision_assets(revision_id,asset_id) VALUES($1,$2)',[revisionId,id])}
  if(value.documents.length){const rows=await client.query('SELECT id FROM documents WHERE id=ANY($1::uuid[]) FOR SHARE',[value.documents.map(d=>d.id)]);if(rows.rowCount!==value.documents.length)throw fail('附件不存在');for(let i=0;i<value.documents.length;i++){const d=value.documents[i];await client.query('INSERT INTO research_revision_documents(revision_id,document_id,label,is_public,display_order) VALUES($1,$2,$3,$4,$5)',[revisionId,d.id,d.label,d.isPublic,i])}}
  if(value.links.length){const own=(await client.query('SELECT content_id FROM content_revisions WHERE id=$1',[revisionId])).rows[0];if(value.links.includes(own.content_id))throw fail('内容不能关联自身');const rows=await client.query("SELECT id,type FROM content_items WHERE id=ANY($1::uuid[]) AND type IN ('direction','project','member') FOR SHARE",[value.links]);if(rows.rowCount!==value.links.length)throw fail('关联对象须为现有方向、项目或成员');for(const id of value.links)await client.query('INSERT INTO research_revision_links(revision_id,target_id) VALUES($1,$2)',[revisionId,id])}
}
async function enrich(client,rows,locale,admin=false){
  if(!rows.length)return rows;
  const revisions=rows.map(r=>r.revisionId),imageRefs=await client.query('SELECT revision_id,asset_id FROM research_revision_assets WHERE revision_id=ANY($1::uuid[])',[revisions]);
  const ids=[...new Set(imageRefs.rows.map(r=>r.asset_id))],assets=await activeAssets(client,ids),publicMedia=Object.fromEntries(assets.map(a=>[a.id,publicAsset(a,locale)]));
  let privateMedia={};if(admin&&ids.length){privateMedia=Object.fromEntries((await client.query('SELECT id,display_name AS "displayName",alt_zh,alt_en FROM assets WHERE id=ANY($1::uuid[])',[ids])).rows.map(a=>[a.id,{id:a.id,displayName:a.displayName,alt:locale==='en'?a.alt_en||a.alt_zh:a.alt_zh,url:'/api/admin/v1/assets/'+a.id+'/file',available:!!publicMedia[a.id]}]))}
  const docs=(await client.query(`SELECT a.revision_id,a.document_id AS id,a.label,a.is_public AS "isPublic",d.display_name AS "displayName",d.bytes,d.pages,d.document_version AS "documentVersion",d.status,d.public_allowed AS "publicAllowed" FROM research_revision_documents a JOIN documents d ON d.id=a.document_id WHERE a.revision_id=ANY($1::uuid[]) ORDER BY a.display_order`,[revisions])).rows;
  const links=(await client.query(`SELECT a.revision_id,i.id,i.slug,i.type,COALESCE(l.title,'未发布资料') AS title, p.revision_id IS NOT NULL AS published FROM research_revision_links a JOIN content_items i ON i.id=a.target_id LEFT JOIN content_publications p ON p.content_id=i.id AND p.locale=$2 LEFT JOIN content_localizations l ON l.revision_id=p.revision_id AND l.locale=p.locale WHERE a.revision_id=ANY($1::uuid[]) ${admin?'':"AND p.revision_id IS NOT NULL AND (i.type<>'member' OR EXISTS(SELECT 1 FROM member_permissions WHERE content_id=i.id AND field='profile' AND permitted))"}`,[revisions,locale])).rows;
  const incoming=admin?[]:(await client.query(`SELECT target.id AS revision_id,i.id,i.slug,i.type,l.title,true AS published FROM research_revision_links edge JOIN content_revisions target ON target.content_id=edge.target_id JOIN content_publications p ON p.revision_id=edge.revision_id AND p.locale=$2 JOIN content_items i ON i.id=p.content_id AND i.type='publication' JOIN content_localizations l ON l.revision_id=p.revision_id AND l.locale=p.locale WHERE target.id=ANY($1::uuid[])`,[revisions,locale])).rows;
  for(const row of rows){
    row.richText=row.extra_json?.richText||null;row.coverAssetId=row.extra_json?.coverAssetId||null;
    row.media=Object.fromEntries(imageRefs.rows.filter(r=>r.revision_id===row.revisionId).map(r=>[r.asset_id,(admin?privateMedia:publicMedia)[r.asset_id]]).filter(([,a])=>a));row.cover=row.media[row.coverAssetId]||null;
    row.documents=docs.filter(d=>d.revision_id===row.revisionId&&(admin||(d.isPublic&&d.publicAllowed&&d.status==='active'))).map(({revision_id,status,publicAllowed,...d})=>({...d,...(admin?{status,publicAllowed}:{}),url:admin?'/api/admin/v1/documents/'+d.id+'/file':'/api/v1/publications/'+encodeURIComponent(row.slug)+'/documents/'+d.id+'/file?locale='+locale}));
    row.links=[...links,...incoming].filter(l=>l.revision_id===row.revisionId).map(({revision_id,...l})=>l);
    delete row.extra_json;
  }
  return rows;
}
async function assertPublish(client,row){
  const referenced=(await client.query('SELECT asset_id FROM research_revision_assets WHERE revision_id=$1',[row.revisionId])).rows.map(r=>r.asset_id);
  if(referenced.length){await client.query('SELECT id FROM assets WHERE id=ANY($1::uuid[]) FOR SHARE',[referenced]);if((await activeAssets(client,referenced)).length!==referenced.length)throw fail('成果引用图片尚未启用或公开授权不完整')}
  const docs=await client.query(`SELECT d.id,d.status,d.public_allowed FROM research_revision_documents a JOIN documents d ON d.id=a.document_id WHERE a.revision_id=$1 AND a.is_public FOR SHARE OF d`,[row.revisionId]);
  if(docs.rows.some(d=>d.status!=='active'||!d.public_allowed))throw fail('公开附件尚未允许公开或未启用；可在文档库处理，或取消该附件的公开勾选');
}
module.exports={normalize,save,enrich,assertPublish};
