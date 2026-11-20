CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key text NOT NULL UNIQUE,
  sha256 text NOT NULL UNIQUE,
  original_name text NOT NULL,
  display_name text NOT NULL,
  folder text NOT NULL DEFAULT '未分类',
  bytes integer NOT NULL CHECK (bytes > 0),
  pages integer NOT NULL CHECK (pages BETWEEN 1 AND 2000),
  document_version text NOT NULL DEFAULT 'other' CHECK (document_version IN ('submitted','accepted','published','certificate','other')),
  source_note text NOT NULL,
  public_allowed boolean NOT NULL DEFAULT false,
  evidence_note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','disabled')),
  created_by uuid NOT NULL REFERENCES admin_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE publication_revisions ADD COLUMN achievement_type text NOT NULL DEFAULT 'paper' CHECK (achievement_type IN ('paper','patent','software'));
ALTER TABLE publication_revisions ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE publication_revisions ADD COLUMN featured boolean NOT NULL DEFAULT false;
ALTER TABLE publication_revisions ADD COLUMN display_order integer NOT NULL DEFAULT 0 CHECK (display_order BETWEEN 0 AND 9999);
CREATE TABLE research_revision_documents (
  revision_id uuid NOT NULL REFERENCES content_revisions(id),
  document_id uuid NOT NULL REFERENCES documents(id),
  label text NOT NULL,
  is_public boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (revision_id,document_id)
);
CREATE INDEX research_documents_document ON research_revision_documents(document_id);
CREATE TABLE research_revision_links (
  revision_id uuid NOT NULL REFERENCES content_revisions(id),
  target_id uuid NOT NULL REFERENCES content_items(id),
  PRIMARY KEY(revision_id,target_id)
);
CREATE INDEX research_links_target ON research_revision_links(target_id);
CREATE TABLE research_revision_assets (
  revision_id uuid NOT NULL REFERENCES content_revisions(id),
  asset_id uuid NOT NULL REFERENCES assets(id),
  PRIMARY KEY(revision_id,asset_id)
);
CREATE INDEX research_assets_asset ON research_revision_assets(asset_id);
