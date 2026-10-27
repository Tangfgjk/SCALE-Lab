-- Preserve IDs, revisions, publications and permissions while moving albums into
-- the shared news editor. Legacy activity tables remain as historical records.
ALTER TABLE news_revisions ADD COLUMN location text NOT NULL DEFAULT '';

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM content_items a JOIN content_items n ON n.slug=a.slug
    WHERE a.type='activity' AND n.type='news') THEN
    RAISE EXCEPTION 'Activity/news slug collision: resolve explicitly before migration';
  END IF;
END $$;

INSERT INTO news_revisions(revision_id,category,happened_at,cover_asset_id,location)
SELECT a.revision_id,'activity',a.activity_date,
  (SELECT ca.asset_id FROM content_assets ca WHERE ca.revision_id=a.revision_id ORDER BY ca.display_order LIMIT 1),a.location
FROM activity_revisions a;

UPDATE content_localizations l SET extra_json=l.extra_json || jsonb_build_object('richText',
  jsonb_build_object('type','doc','schemaVersion',1,'content',
    COALESCE((SELECT jsonb_agg(jsonb_build_object('type','paragraph','content',
      jsonb_build_array(jsonb_build_object('type','text','text',t.paragraph))) ORDER BY t.ordinal)
      FROM regexp_split_to_table(l.body,E'\n[\r\n ]*\n') WITH ORDINALITY t(paragraph,ordinal)
      WHERE length(trim(t.paragraph))>0),'[]'::jsonb) ||
    COALESCE((SELECT jsonb_agg(jsonb_build_object('type','image','attrs',jsonb_build_object(
      'assetId',ca.asset_id,'caption',CASE WHEN l.locale='en' THEN ca.caption_en ELSE ca.caption_zh END,
      'width','large','align','center')) ORDER BY ca.display_order)
      FROM content_assets ca WHERE ca.revision_id=l.revision_id),'[]'::jsonb)))
WHERE EXISTS (SELECT 1 FROM activity_revisions a WHERE a.revision_id=l.revision_id);

INSERT INTO news_revision_assets(revision_id,asset_id,purpose,position)
SELECT ca.revision_id,ca.asset_id,'body',row_number() OVER (PARTITION BY ca.revision_id ORDER BY ca.display_order)-1
FROM content_assets ca JOIN activity_revisions a ON a.revision_id=ca.revision_id;
INSERT INTO news_revision_assets(revision_id,asset_id,purpose,position)
SELECT n.revision_id,n.cover_asset_id,'cover',0 FROM news_revisions n
JOIN activity_revisions a ON a.revision_id=n.revision_id WHERE n.cover_asset_id IS NOT NULL;

UPDATE content_items SET type='news' WHERE type='activity';
