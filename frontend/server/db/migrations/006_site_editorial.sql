ALTER TABLE site_setting_revisions
  ADD COLUMN hero_title_before text NOT NULL DEFAULT '',
  ADD COLUMN hero_highlight text NOT NULL DEFAULT '',
  ADD COLUMN hero_title_after text NOT NULL DEFAULT '',
  ADD COLUMN culture_title text NOT NULL DEFAULT '',
  ADD COLUMN culture_vision text NOT NULL DEFAULT '',
  ADD COLUMN culture_values jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(culture_values) = 'array');
