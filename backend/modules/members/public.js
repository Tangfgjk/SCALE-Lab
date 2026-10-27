"use strict";
const {activeAssets,publicAsset}=require('../../media');
// One published-revision query plus one batched asset query, regardless of member count.
async function readMembers(db,locale,{slug=null,includeDetails=false}={}){
  const {rows}=await db.query(`SELECT i.slug,l.title AS "nameZh",l.body AS bio,
    COALESCE(l.extra_json->>'profileDetails','') AS "profileDetails",m.category,m.name_en AS "nameEn",m.member_role AS role,
    m.interests,m.homepage_url AS "homepageUrl",m.orcid_url AS "orcidUrl",m.github_url AS "githubUrl",
    m.public_email AS "publicEmail",m.destination,m.display_order AS "displayOrder",m.photo_asset_id AS "photoAssetId",
    (SELECT jsonb_object_agg(field,permitted) FROM member_permissions WHERE content_id=i.id) AS permission
    FROM content_items i JOIN content_publications p ON p.content_id=i.id AND p.locale=$1
    JOIN content_localizations l ON l.revision_id=p.revision_id AND l.locale=p.locale
    JOIN member_revisions m ON m.revision_id=p.revision_id
    WHERE i.type='member' AND ($2::text IS NULL OR i.slug=$2)
      AND EXISTS(SELECT 1 FROM member_permissions WHERE content_id=i.id AND field='profile' AND permitted=true)`,[locale,slug]);
  const photos=await activeAssets(db,[...new Set(rows.filter(r=>r.permission?.photo&&r.photoAssetId).map(r=>r.photoAssetId))]);
  const byId=new Map(photos.map(a=>[a.id,a]));
  const result=rows.map(r=>({slug:r.slug,category:r.category,nameZh:r.nameZh,nameEn:r.nameEn,role:r.role,
    bio:r.permission?.bio?r.bio:'',hasDetails:!!(r.permission?.bio&&r.profileDetails),
    ...(includeDetails?{profileDetails:r.permission?.bio?r.profileDetails:''}:{}),interests:r.interests,tags:r.interests,
    homepage:r.homepageUrl||'',links:{orcid:r.orcidUrl||'',github:r.githubUrl||'',email:r.permission?.email?r.publicEmail||'':''},
    destination:r.permission?.destination?r.destination||'':'',photo:r.permission?.photo&&byId.has(r.photoAssetId)?publicAsset(byId.get(r.photoAssetId),locale).url:'',displayOrder:r.displayOrder}));
  const order={advisor:0,researcher:1,postdoc:2,student:3,alumni:4};
  return result.sort((a,b)=>order[a.category]-order[b.category]||a.displayOrder-b.displayOrder||a.nameZh.localeCompare(b.nameZh,'zh'));
}
module.exports={readMembers};
