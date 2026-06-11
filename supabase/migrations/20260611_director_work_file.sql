ALTER TABLE shared_scripts
ADD COLUMN IF NOT EXISTS director_work_file_id TEXT DEFAULT NULL;
