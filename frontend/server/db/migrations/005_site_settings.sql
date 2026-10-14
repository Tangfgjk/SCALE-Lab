CREATE TABLE site_settings (
  key text PRIMARY KEY CHECK (key = 'main'),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO site_settings(key) VALUES('main');

CREATE TABLE site_setting_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL REFERENCES site_settings(key) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  locale text NOT NULL CHECK (locale IN ('zh','en')),
  name text NOT NULL,
  short_name text NOT NULL,
  intro text NOT NULL,
  tagline text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  university text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  logo_asset_id uuid REFERENCES assets(id) ON DELETE RESTRICT,
  featured jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(featured) = 'object'),
  stats jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(stats) = 'array'),
  source_url text,
  source_note text,
  review_state text NOT NULL DEFAULT 'unverified' CHECK (review_state IN ('unverified','ready')),
  checked_by uuid REFERENCES admin_users(id),
  checked_at timestamptz,
  changed_by uuid NOT NULL REFERENCES admin_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(key,version),
  UNIQUE(key,id),
  CHECK (nullif(trim(coalesce(source_url,'')), '') IS NOT NULL OR nullif(trim(coalesce(source_note,'')), '') IS NOT NULL)
);

CREATE TABLE site_setting_publications (
  key text NOT NULL,
  locale text NOT NULL CHECK (locale IN ('zh','en')),
  revision_id uuid NOT NULL,
  published_by uuid NOT NULL REFERENCES admin_users(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(key,locale),
  FOREIGN KEY(key,revision_id) REFERENCES site_setting_revisions(key,id) ON DELETE RESTRICT
);
