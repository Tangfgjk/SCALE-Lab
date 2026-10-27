ALTER TABLE news_revisions ADD CONSTRAINT news_cover_asset_fk
  FOREIGN KEY (cover_asset_id) REFERENCES assets(id) ON DELETE RESTRICT;
CREATE INDEX news_cover_asset_idx ON news_revisions(cover_asset_id);
CREATE TABLE news_revision_assets (
  revision_id uuid NOT NULL REFERENCES news_revisions(revision_id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  purpose text NOT NULL CHECK (purpose IN ('cover','body')),
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY(revision_id,purpose,position),
  CHECK (purpose <> 'cover' OR position=0)
);
CREATE INDEX news_revision_assets_asset_idx ON news_revision_assets(asset_id);
INSERT INTO news_revision_assets(revision_id,asset_id,purpose,position)
SELECT revision_id,cover_asset_id,'cover',0 FROM news_revisions WHERE cover_asset_id IS NOT NULL;
