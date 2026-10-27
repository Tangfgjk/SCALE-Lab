CREATE TABLE member_revisions (
  revision_id uuid PRIMARY KEY REFERENCES content_revisions(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (category IN ('advisor','researcher','student','alumni')),
  name_en text NOT NULL DEFAULT '',
  member_role text NOT NULL,
  interests jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(interests) = 'array'),
  homepage_url text,
  orcid_url text,
  github_url text,
  public_email text,
  destination text,
  photo_path text,
  display_order integer NOT NULL DEFAULT 0
);

CREATE TABLE member_permissions (
  content_id uuid NOT NULL REFERENCES content_items(id) ON DELETE RESTRICT,
  field text NOT NULL CHECK (field IN ('profile','bio','email','destination','photo')),
  permitted boolean NOT NULL DEFAULT false,
  evidence_note text,
  changed_by uuid NOT NULL REFERENCES admin_users(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(content_id,field),
  CHECK (permitted = false OR nullif(trim(coalesce(evidence_note,'')), '') IS NOT NULL)
);
CREATE INDEX member_permissions_field_idx ON member_permissions (field, permitted);
