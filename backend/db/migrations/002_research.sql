CREATE TABLE direction_revisions (
  revision_id uuid PRIMARY KEY REFERENCES content_revisions(id) ON DELETE RESTRICT,
  theme_number integer NOT NULL CHECK (theme_number BETWEEN 1 AND 99),
  participants text NOT NULL DEFAULT '',
  areas jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(areas) = 'array')
);

CREATE TABLE publication_revisions (
  revision_id uuid PRIMARY KEY REFERENCES content_revisions(id) ON DELETE RESTRICT,
  publication_year integer NOT NULL CHECK (publication_year BETWEEN 1900 AND 2100),
  authors text NOT NULL,
  venue text NOT NULL,
  publication_stage text NOT NULL CHECK (publication_stage IN ('published','accepted','in_press','preprint')),
  doi text,
  external_url text,
  badge text NOT NULL DEFAULT ''
);
CREATE INDEX publication_revisions_doi_idx ON publication_revisions (lower(doi)) WHERE doi IS NOT NULL;

CREATE TABLE project_revisions (
  revision_id uuid PRIMARY KEY REFERENCES content_revisions(id) ON DELETE RESTRICT,
  grant_code text,
  funding_type text NOT NULL,
  project_role text NOT NULL,
  project_status text NOT NULL CHECK (project_status IN ('planned','ongoing','completed')),
  starts_on date,
  ends_on date,
  CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX project_revisions_grant_idx ON project_revisions (grant_code) WHERE grant_code IS NOT NULL;
