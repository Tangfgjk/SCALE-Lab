"use strict";
const express=require('express');
const {activeAssets,publicAsset}=require('../../media');
const {imageIds}=require('../../rich-text');
function pageOptions(query){
  const page=Number(query.page||1),pageSize=Number(query.pageSize||10);
  if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>100)throw Object.assign(Error('分页参数无效'),{status:400,code:'INVALID_PAGE'});
  const year=String(query.year||''),q=String(query.q||'').trim();
  if((year&&!/^\d{4}$/.test(year))||q.length>200)throw Object.assign(Error('筛选参数无效'),{status:400,code:'INVALID_FILTER'});
  return{page,pageSize,year,q};
}
function publicCollections(db){
  const router=express.Router();
  for(const type of ['news','activities'])router.get('/'+type,async(req,res,next)=>{try{
    const locale=req.query.locale==='en'?'en':'zh',activity=type==='activities';
    const {page,pageSize,year,q}=pageOptions(req.query);
    const values=[locale,activity?'activity':'news',year,q];
    const from=`FROM content_publications p JOIN content_items i ON i.id=p.content_id
      JOIN content_localizations l ON l.revision_id=p.revision_id AND l.locale=p.locale
      JOIN news_revisions n ON n.revision_id=p.revision_id
      WHERE i.type='news' AND p.locale=$1 AND n.category=$2
      AND ($3='' OR extract(year FROM n.happened_at)::text=$3)
      AND ($4='' OR strpos(lower(l.title||' '||l.summary),lower($4))>0)`;
    const total=Number((await db.query('SELECT count(*) '+from,values)).rows[0].count);
    const {rows}=await db.query(`SELECT i.slug,l.title,l.summary,n.category,n.location,n.cover_asset_id,
      ${activity?'l.extra_json,':''} to_char(n.happened_at,'YYYY-MM-DD') AS "happenedAt",p.published_at AS "publishedAt"
      ${from} ORDER BY n.happened_at DESC,p.published_at DESC,i.id DESC LIMIT $5 OFFSET $6`,[...values,pageSize,(page-1)*pageSize]);
    if(activity){
      const ids=[...new Set(rows.flatMap(r=>[r.cover_asset_id,...imageIds(r.extra_json?.richText)].filter(Boolean)))];
      const media=new Map((await activeAssets(db,ids)).map(a=>[a.id,publicAsset(a,locale)]));
      for(const row of rows){
        const captions=new Map();function visit(n){if(n?.type==='image')captions.set(n.attrs.assetId,n.attrs.caption||'');(n?.content||[]).forEach(visit)}visit(row.extra_json?.richText);
        const available=[...new Set([row.cover_asset_id,...imageIds(row.extra_json?.richText)].filter(Boolean))].filter(id=>media.has(id));
        row.cover=media.get(row.cover_asset_id)||media.get(available[0])||null;row.activityDate=row.happenedAt;row.hasArticle=true;
        if(req.query.view!=='overview')row.images=available.map(id=>({...media.get(id),caption:captions.get(id)||''}));
        delete row.extra_json;
      }
    }
    rows.forEach(row=>{delete row.cover_asset_id});
    const years=(await db.query(`SELECT DISTINCT extract(year FROM n.happened_at)::int AS year FROM content_publications p JOIN content_items i ON i.id=p.content_id JOIN news_revisions n ON n.revision_id=p.revision_id WHERE i.type='news' AND p.locale=$1 AND n.category=$2 ORDER BY year DESC`,values.slice(0,2))).rows.map(r=>String(r.year));
    res.set('Cache-Control','no-store');res.json({data:rows,meta:{total,page,pageSize,pages:Math.ceil(total/pageSize),years},requestId:req.requestId});
  }catch(error){next(error)}});
  return router;
}
module.exports={publicCollections,pageOptions};
