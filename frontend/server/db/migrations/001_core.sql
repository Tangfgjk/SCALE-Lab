CREATE TABLE admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 100),
  role text NOT NULL CHECK (role IN ('admin', 'content_manager')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subject)
);

CREATE TABLE admin_password_credentials (
  user_id uuid PRIMARY KEY REFERENCES admin_users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  csrf_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_sessions_user_idx ON admin_sessions (user_id, expires_at DESC);

CREATE TABLE content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('member','news','publication','project','direction','activity')),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  display_order integer NOT NULL DEFAULT 0,
  current_revision_id uuid,
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_by uuid REFERENCES admin_users(id),
  updated_by uuid REFERENCES admin_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (type, slug)
);

CREATE TABLE content_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL REFERENCES content_items(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  changed_by uuid NOT NULL REFERENCES admin_users(id),
  change_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_id, version),
  UNIQUE (content_id, id)
);
ALTER TABLE content_items ADD CONSTRAINT current_revision_belongs_to_item
  FOREIGN KEY (id, current_revision_id) REFERENCES content_revisions(content_id, id)
  DEFERRABLE INITIALLY IMMEDIATE;

CREATE TABLE content_localizations (
  revision_id uuid NOT NULL REFERENCES content_revisions(id) ON DELETE RESTRICT,
  locale text NOT NULL CHECK (locale IN ('zh','en')),
  title text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  extra_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_state text NOT NULL DEFAULT 'unverified' CHECK (review_state IN ('unverified','ready')),
  reviewed_by uuid REFERENCES admin_users(id),
  reviewed_at timestamptz,
  PRIMARY KEY (revision_id, locale)
);

CREATE TABLE content_publications (
  content_id uuid NOT NULL REFERENCES content_items(id) ON DELETE RESTRICT,
  locale text NOT NULL CHECK (locale IN ('zh','en')),
  revision_id uuid NOT NULL,
  published_by uuid NOT NULL REFERENCES admin_users(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_id, locale),
  FOREIGN KEY (content_id, revision_id) REFERENCES content_revisions(content_id, id) ON DELETE RESTRICT
);
CREATE INDEX content_publications_locale_idx ON content_publications (locale, published_at DESC);
CREATE INDEX content_items_type_status_order_idx ON content_items (type, status, display_order);

CREATE TABLE news_revisions (
  revision_id uuid PRIMARY KEY REFERENCES content_revisions(id) ON DELETE RESTRICT,
  category text NOT NULL DEFAULT 'news',
  happened_at date NOT NULL,
  cover_asset_id uuid
);

CREATE TABLE content_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES content_revisions(id) ON DELETE RESTRICT,
  source_url text,
  source_note text,
  checked_by uuid REFERENCES admin_users(id),
  checked_at timestamptz,
  CHECK (nullif(trim(coalesce(source_url,'')), '') IS NOT NULL
      OR nullif(trim(coalesce(source_note,'')), '') IS NOT NULL)
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES admin_users(id),
  action text NOT NULL,
  content_id uuid REFERENCES content_items(id),
  revision_id uuid REFERENCES content_revisions(id),
  detail_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_created_idx ON audit_events (created_at DESC);
