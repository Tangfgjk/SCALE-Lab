ALTER TABLE member_revisions
  ADD COLUMN photo_asset_id uuid REFERENCES assets(id) ON DELETE RESTRICT;

CREATE INDEX member_revisions_photo_asset_idx
  ON member_revisions(photo_asset_id) WHERE photo_asset_id IS NOT NULL;
