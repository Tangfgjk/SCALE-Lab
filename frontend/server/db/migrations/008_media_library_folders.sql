CREATE TABLE media_libraries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 100),
  created_by uuid NOT NULL REFERENCES admin_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE media_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id uuid NOT NULL REFERENCES media_libraries(id) ON DELETE RESTRICT,
  parent_id uuid,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  created_by uuid NOT NULL REFERENCES admin_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (library_id, parent_id, name),
  UNIQUE (id, library_id),
  FOREIGN KEY (parent_id, library_id) REFERENCES media_folders(id, library_id) ON DELETE RESTRICT,
  CHECK (parent_id IS DISTINCT FROM id)
);
CREATE INDEX media_folders_library_idx ON media_folders(library_id, parent_id, name);

ALTER TABLE assets ADD COLUMN display_name text NOT NULL DEFAULT '';
ALTER TABLE assets ADD COLUMN folder_id uuid REFERENCES media_folders(id) ON DELETE RESTRICT;
ALTER TABLE assets ADD COLUMN archived boolean NOT NULL DEFAULT false;
ALTER TABLE assets ADD CONSTRAINT asset_display_name_length CHECK (length(display_name) <= 200);
CREATE INDEX assets_folder_idx ON assets(folder_id);

UPDATE assets SET display_name = left(COALESCE(NULLIF(alt_zh, ''), split_part(storage_key, '/', 3)),200)
WHERE display_name='';
UPDATE assets SET display_name=left(display_name,200) WHERE length(display_name)>200;

INSERT INTO media_libraries(name,created_by)
SELECT '默认图片库',id FROM admin_users ORDER BY created_at,id LIMIT 1;
INSERT INTO media_folders(library_id,name,created_by)
SELECT id,'未分类',created_by FROM media_libraries WHERE name='默认图片库';
UPDATE assets SET folder_id=(SELECT f.id FROM media_folders f JOIN media_libraries l ON l.id=f.library_id
  WHERE l.name='默认图片库' AND f.name='未分类' AND f.parent_id IS NULL);
