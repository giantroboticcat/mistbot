-- Add UNIQUE constraint to scene_tags to prevent duplicate tags per scene
-- This ensures that each tag/status/limit can only exist once per scene

CREATE UNIQUE INDEX IF NOT EXISTS idx_scene_tags_unique ON scene_tags(scene_id, tag, tag_type);

