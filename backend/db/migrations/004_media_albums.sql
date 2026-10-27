CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (mime_type = 'image/webp'),
  bytes integer NOT NULL CHECK (bytes > 0),
  width integer NOT NULL CHECK (width BETWEEN 1 AND 10000),
  height integer NOT NULL CHECK (height BETWEEN 1 AND 10000),
  alt_zh text NOT NULL DEFAULT '',
  alt_en text NOT NULL DEFAULT '',
  credit text NOT NULL DEFAULT '',
  source_note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','disabled')),
  created_by uuid NOT NULL REFERENCES admin_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE asset_clearances (
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  clearance_type text NOT NULL CHECK (clearance_type IN ('copyright','people')),
  allowed boolean NOT NULL DEFAULT false,
  evidence_note text,
  changed_by uuid NOT NULL REFERENCES admin_users(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(asset_id,clearance_type),
  CHECK (allowed = false OR nullif(trim(coalesce(evidence_note,'')), '') IS NOT NULL)
);

CREATE TABLE activity_revisions (
  revision_id uuid PRIMARY KEY REFERENCES content_revisions(id) ON DELETE RESTRICT,
  activity_date date NOT NULL,
  location text NOT NULL DEFAULT ''
);

CREATE TABLE content_assets (
  revision_id uuid NOT NULL REFERENCES content_revisions(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  display_order integer NOT NULL CHECK (display_order BETWEEN 0 AND 999),
  caption_zh text NOT NULL DEFAULT '',
  caption_en text NOT NULL DEFAULT '',
  PRIMARY KEY(revision_id,asset_id),
  UNIQUE(revision_id,display_order)
);
CREATE INDEX content_assets_asset_idx ON content_assets(asset_id);
