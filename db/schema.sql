DROP TABLE IF EXISTS database_table_views CASCADE;
DROP TABLE IF EXISTS database_tables CASCADE;
DROP TABLE IF EXISTS database_table_items CASCADE;
DROP TABLE IF EXISTS digital_items CASCADE;
DROP TABLE IF EXISTS physical_items CASCADE;
DROP TABLE IF EXISTS physical_locations CASCADE;
DROP TABLE IF EXISTS persons CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS tags CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS entity_relations CASCADE;
DROP TABLE IF EXISTS entity_tags CASCADE;
DROP TABLE IF EXISTS entity_observations CASCADE;
DROP TABLE IF EXISTS entity_metadata CASCADE;
DROP TABLE IF EXISTS entities CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS guidelines CASCADE;
DROP TABLE IF EXISTS activities CASCADE;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- Create custom enum types
CREATE TYPE entity_type AS ENUM (
  'activity',
  'database',
  'database_item',
  'database_view',
  'digital_item',
  'guideline',
  'organization',
  'person',
  'physical_item',
  'physical_location',
  'tag',
  'task',
  'text',
  'type_definition',
  'type_extension'
);

CREATE TYPE task_status_type AS ENUM (
  'No status',
  'Waiting',
  'Paused',
  'Planned',
  'Started',
  'In Progress',
  'Completed',
  'Cancelled',
  'Blocked'
);

CREATE TYPE priority_type AS ENUM (
  'None',
  'Low',
  'Medium',
  'High',
  'Critical'
);

CREATE TYPE importance_type AS ENUM (
  'Core',
  'Standard',
  'Premium',
  'Potential'
);

CREATE TYPE frequency_type AS ENUM (
  'Daily',
  'Weekly',
  'Infrequent'
);

CREATE TYPE file_type AS ENUM (
  'Document',
  'Image',
  'Video',
  'Software',
  'Code'
);

CREATE TYPE guideline_status_type AS ENUM (
  'Draft',
  'Approved',
  'Deprecated'
);

-- Create the users table (foundational)
CREATE TABLE users (
  user_id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
  public_key VARCHAR(64) NOT NULL UNIQUE,
  username VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT check_updated_at CHECK (
    updated_at IS NULL
    OR updated_at >= created_at
  )
);
-- Create the unified entity table (core of the model with content fields integrated)
CREATE TABLE entities (
  entity_id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  type entity_type NOT NULL,
  permalink VARCHAR(255),
  description TEXT,
  user_id UUID NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  embedding vector(1536),
  git_sha VARCHAR(40),  -- Git commit hash for markdown files
  content TEXT,
  markdown TEXT,
  frontmatter JSONB,
  file_path VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  archived_at TIMESTAMP,
  CONSTRAINT check_updated_at CHECK (
    updated_at IS NULL OR updated_at >= created_at
  ),
  CONSTRAINT check_archived_at CHECK (
    archived_at IS NULL OR archived_at >= updated_at
  )
);

-- Add constraint for text type to require markdown and frontmatter
ALTER TABLE entities
ADD CONSTRAINT check_text_fields
CHECK (
  type != 'text' OR
  (markdown IS NOT NULL AND frontmatter IS NOT NULL AND file_path IS NOT NULL)
);

-- Audit log for tracking changes
CREATE TABLE audit_log (
  audit_id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
  table_name VARCHAR(255) NOT NULL,
  record_id UUID NOT NULL,
  operation CHAR(1) NOT NULL CHECK (operation IN ('I', 'U', 'D')),
  old_data JSONB,
  new_data JSONB,
  changed_by UUID,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create entity extension tables
CREATE TABLE physical_locations (
  entity_id UUID PRIMARY KEY REFERENCES entities (entity_id) ON DELETE CASCADE,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  mail_address TEXT,
  mail_address2 TEXT,
  mail_careof TEXT,
  mail_street_number TEXT,
  mail_street_prefix TEXT,
  mail_street_name TEXT,
  mail_street_type TEXT,
  mail_street_suffix TEXT,
  mail_unit_number TEXT,
  mail_city TEXT,
  mail_state TEXT,
  mail_zip TEXT,
  mail_country TEXT,
  mail_urbanization TEXT
);

CREATE TABLE physical_items (
  entity_id UUID PRIMARY KEY REFERENCES entities (entity_id) ON DELETE CASCADE,
  serial_number VARCHAR(255),
  model_number VARCHAR(255),
  manufacturer VARCHAR(255),
  storage_location VARCHAR(255),
  acquisition_date DATE,
  target_location VARCHAR(255), -- TODO should maybe refer to an entity
  current_location VARCHAR(255), -- TODO should maybe refer to an entity
  home_areas TEXT[],
  home_attribute TEXT[],
  activities TEXT[],
  importance importance_type,
  frequency_of_use frequency_type,
  height_inches DECIMAL(10, 2),
  width_inches DECIMAL(10, 2),
  depth_inches DECIMAL(10, 2),
  weight_ounces DECIMAL(10, 2),
  volume_cubic_inches DECIMAL(10, 2),
  voltage VARCHAR(20),
  wattage DECIMAL(10, 2),
  outlets_used INTEGER,
  water_connection BOOLEAN,
  drain_connection BOOLEAN,
  ethernet_connected BOOLEAN,
  min_storage_temperature_celsius DECIMAL(5, 2),
  max_storage_temperature_celsius DECIMAL(5, 2),
  min_storage_humidity_percent DECIMAL(5, 2),
  max_storage_humidity_percent DECIMAL(5, 2),
  exist BOOLEAN,
  current_quantity INTEGER,
  target_quantity INTEGER,
  consumable BOOLEAN,
  perishable BOOLEAN,
  kit_name VARCHAR(255),
  kit_items TEXT[],
  large_drawer_units INTEGER,
  standard_drawer_units INTEGER,
  storage_notes TEXT,
  misc_notes TEXT
);

CREATE TABLE digital_items (
  entity_id UUID PRIMARY KEY REFERENCES entities (entity_id) ON DELETE CASCADE,
  file_type file_type,
  file_uri VARCHAR(500),
  file_size VARCHAR(50),
  file_hash VARCHAR(100),
  ipfs_hash VARCHAR(100),
  text TEXT,
  html TEXT,
  search_vector tsvector
);

CREATE TABLE persons (
  entity_id UUID PRIMARY KEY REFERENCES entities (entity_id) ON DELETE CASCADE,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  mobile_phone VARCHAR(255),
  website_url VARCHAR(255)
);

CREATE TABLE organizations (
  entity_id UUID PRIMARY KEY REFERENCES entities (entity_id) ON DELETE CASCADE,
  website_url VARCHAR(255)
);

CREATE TABLE tasks (
  entity_id UUID PRIMARY KEY REFERENCES entities (entity_id) ON DELETE CASCADE,
  status task_status_type DEFAULT 'No status',
  priority priority_type,
  assigned_to VARCHAR(255),
  start_by TIMESTAMP,
  finish_by TIMESTAMP,
  finish_by_text_input TEXT,
  estimated_total_duration INTEGER,
  estimated_preparation_duration INTEGER,
  estimated_execution_duration INTEGER,
  estimated_cleanup_duration INTEGER,
  actual_duration INTEGER,
  planned_start TIMESTAMP,
  planned_finish TIMESTAMP,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  snooze_until TIMESTAMP,
  CONSTRAINT check_estimated_duration CHECK (
    estimated_total_duration IS NULL
    OR estimated_total_duration >= COALESCE(estimated_preparation_duration, 0) + COALESCE(estimated_execution_duration, 0) + COALESCE(estimated_cleanup_duration, 0)
  )
);

-- Create guidelines table
CREATE TABLE guidelines (
  entity_id UUID PRIMARY KEY REFERENCES entities (entity_id) ON DELETE CASCADE,
  guideline_status guideline_status_type,
  effective_date DATE
);

-- Activities table with guidelines reference
CREATE TABLE activities (
  entity_id UUID PRIMARY KEY REFERENCES entities (entity_id) ON DELETE CASCADE
);

-- Create database_tables table
CREATE TABLE database_tables (
  entity_id UUID PRIMARY KEY REFERENCES entities (entity_id) ON DELETE CASCADE,
  table_name VARCHAR(255) NOT NULL,
  table_description TEXT,
  fields JSONB NOT NULL,
  UNIQUE (table_name, entity_id)
);

-- Create database_table_items table
CREATE TABLE database_table_items (
  entity_id UUID PRIMARY KEY REFERENCES entities (entity_id) ON DELETE CASCADE,
  database_table_id UUID NOT NULL REFERENCES database_tables (entity_id) ON DELETE CASCADE,
  field_values JSONB NOT NULL
);

CREATE TABLE database_table_views (
  entity_id UUID PRIMARY KEY REFERENCES entities (entity_id) ON DELETE CASCADE,
  view_name VARCHAR(255) NOT NULL,
  view_description TEXT,
  database_table_name VARCHAR(255) NOT NULL,
  database_table_entity_id UUID NOT NULL REFERENCES entities (entity_id) ON DELETE CASCADE,
  table_state JSONB,
  UNIQUE (view_name, entity_id)
);

-- Create unified relationship tables
CREATE TABLE entity_relations (
  relation_id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
  source_entity_id UUID NOT NULL REFERENCES entities (entity_id) ON DELETE CASCADE,
  target_entity_id UUID REFERENCES entities (entity_id) ON DELETE CASCADE,
  target_title VARCHAR(255), -- Used when target entity doesn't exist in db yet
  relation_type VARCHAR(50) NOT NULL,
  context TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (target_entity_id IS NOT NULL OR target_title IS NOT NULL)
);

CREATE TABLE entity_tags (
  entity_id UUID NOT NULL REFERENCES entities (entity_id) ON DELETE CASCADE,
  tag_entity_id UUID NOT NULL REFERENCES entities (entity_id) ON DELETE CASCADE,
  PRIMARY KEY (entity_id, tag_entity_id)
);

CREATE TABLE entity_observations (
  observation_id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
  entity_id UUID NOT NULL REFERENCES entities (entity_id) ON DELETE CASCADE,
  category VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  context TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE entity_metadata (
  metadata_id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
  entity_id UUID NOT NULL REFERENCES entities (entity_id) ON DELETE CASCADE,
  key VARCHAR(100) NOT NULL,
  value TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT check_updated_at CHECK (
    updated_at IS NULL OR updated_at >= created_at
  ),
  UNIQUE (entity_id, key)
);

-- Create tags table
CREATE TABLE tags (
  entity_id UUID PRIMARY KEY REFERENCES entities (entity_id) ON DELETE CASCADE,
  color VARCHAR(50),
  parent_tag_id UUID REFERENCES entities (entity_id) ON DELETE SET NULL
);

-- Create a unique index on entities for tags by type, title, and user_id
CREATE UNIQUE INDEX idx_unique_tag_entities ON entities (title, user_id)
WHERE type = 'tag';

-- Create indices to improve query performance
CREATE INDEX idx_entities_type ON entities (type);
CREATE INDEX idx_entities_user_id ON entities (user_id);
CREATE INDEX idx_entities_created_at ON entities (created_at DESC);
CREATE INDEX idx_entities_updated_at ON entities (updated_at DESC);
CREATE INDEX idx_entities_archived_at ON entities (archived_at);
CREATE INDEX idx_entities_git_sha ON entities (git_sha);
CREATE INDEX idx_entity_embedding ON entities USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_tag_parent ON tags (parent_tag_id);
CREATE INDEX idx_entity_tags_tag_id ON entity_tags (tag_entity_id);
CREATE INDEX idx_entity_relations_source ON entity_relations (source_entity_id);
CREATE INDEX idx_entity_relations_target ON entity_relations (target_entity_id);
CREATE INDEX idx_entity_relations_type ON entity_relations (relation_type);
CREATE INDEX idx_entity_relations_source_type ON entity_relations (source_entity_id, relation_type);
CREATE INDEX idx_entity_relations_target_type ON entity_relations (target_entity_id, relation_type);
CREATE INDEX idx_tasks_status ON tasks (status);
CREATE INDEX idx_tasks_finish_by ON tasks (finish_by);
CREATE INDEX idx_entities_file_path ON entities (file_path) WHERE type = 'text';
CREATE INDEX idx_entities_frontmatter ON entities USING gin (frontmatter) WHERE type = 'text';
CREATE INDEX idx_entities_markdown_gin ON entities USING gin(to_tsvector('english', markdown)) WHERE type = 'text';
CREATE INDEX idx_entities_content_gin ON entities USING gin(to_tsvector('english', content)) WHERE type = 'text';
CREATE INDEX idx_digital_items_search ON digital_items USING gin(search_vector);
CREATE INDEX idx_audit_log_table_record ON audit_log (table_name, record_id);
CREATE INDEX idx_audit_log_changed_at ON audit_log (changed_at DESC);
CREATE INDEX idx_entity_metadata_key ON entity_metadata (key);
CREATE INDEX idx_entity_observations_category ON entity_observations (category);
CREATE INDEX idx_physical_location_coordinates ON physical_locations (latitude, longitude);
CREATE INDEX idx_database_items_parent ON database_table_items (database_table_id);
CREATE INDEX idx_guideline_status ON guidelines (guideline_status);
CREATE INDEX idx_guideline_effective_date ON guidelines (effective_date);

-- Create a unique index for file paths by user (only for text types)
CREATE UNIQUE INDEX idx_entities_file_path_user
ON entities (file_path, user_id)
WHERE type = 'text' AND file_path IS NOT NULL;

-- Add index for full-text search on description
CREATE INDEX idx_entities_description_gin ON entities
USING gin(to_tsvector('english', description))
WHERE description IS NOT NULL;

CREATE UNIQUE INDEX idx_activities_view_entity_id ON activities_view (entity_id);

-- Create views for convenient access
CREATE VIEW active_entities AS
SELECT * FROM entities
WHERE archived_at IS NULL;

CREATE VIEW hierarchical_tags AS
WITH RECURSIVE tag_hierarchy AS (
  -- Base case: tags with no parent
  SELECT
    t.entity_id,
    e.title,
    e.description,
    t.color,
    t.parent_tag_id,
    e.user_id,
    ARRAY[e.title] AS path,
    0 AS level
  FROM
    tags t
    JOIN entities e ON t.entity_id = e.entity_id
  WHERE
    t.parent_tag_id IS NULL AND e.archived_at IS NULL

  UNION ALL

  -- Recursive case: tags with parent
  SELECT
    t.entity_id,
    e.title,
    e.description,
    t.color,
    t.parent_tag_id,
    e.user_id,
    th.path || e.title,
    th.level + 1
  FROM
    tags t
    JOIN entities e ON t.entity_id = e.entity_id
    JOIN tag_hierarchy th ON t.parent_tag_id = th.entity_id
  WHERE
    e.archived_at IS NULL
)
SELECT
  entity_id,
  title,
  description,
  color,
  parent_tag_id,
  user_id,
  path,
  level,
  array_to_string(path, '/') AS full_path
FROM
  tag_hierarchy
ORDER BY
  path;

CREATE VIEW text_document_view AS
SELECT entity_id, title, type, permalink, description, user_id, embedding,
       git_sha, content, markdown, frontmatter, file_path,
       created_at, updated_at
FROM entities
WHERE archived_at IS NULL AND type = 'text';

-- Create a view for entity statistics and analytics
CREATE VIEW entity_stats AS
SELECT
  e.entity_id,
  e.title,
  e.type,
  COUNT(DISTINCT r.relation_id) AS relation_count,
  COUNT(DISTINCT o.observation_id) AS observation_count,
  COUNT(DISTINCT et.tag_entity_id) AS tag_count,
  COUNT(DISTINCT m.metadata_id) AS metadata_count,
  e.created_at,
  e.updated_at
FROM
  entities e
LEFT JOIN
  entity_relations r ON e.entity_id = r.source_entity_id
LEFT JOIN
  entity_observations o ON e.entity_id = o.entity_id
LEFT JOIN
  entity_tags et ON e.entity_id = et.entity_id
LEFT JOIN
  entity_metadata m ON e.entity_id = m.entity_id
WHERE
  e.archived_at IS NULL
GROUP BY
  e.entity_id, e.title, e.type, e.created_at, e.updated_at;

-- Create view for guidelines with activities that follow them
CREATE VIEW guideline_with_activities AS
SELECT
  g.entity_id,
  e.title,
  e.description,
  g.guideline_status,
  g.effective_date,
  array_agg(DISTINCT r.source_entity_id) AS activity_ids,
  array_agg(DISTINCT ae.title) AS activity_titles
FROM
  guidelines g
JOIN
  entities e ON g.entity_id = e.entity_id
LEFT JOIN
  entity_relations r ON g.entity_id = r.target_entity_id AND r.relation_type = 'follows'
LEFT JOIN
  entities ae ON r.source_entity_id = ae.entity_id AND ae.type = 'activity'
WHERE
  e.archived_at IS NULL
GROUP BY
  g.entity_id, e.title, e.description, g.guideline_status, g.effective_date;

CREATE VIEW task_persons_view AS
SELECT
  source_entity_id AS task_id,
  target_entity_id AS person_id
FROM
  entity_relations
WHERE
  relation_type IN ('assigned_to', 'involves')
AND
  EXISTS (SELECT 1 FROM entities WHERE entity_id = source_entity_id AND type = 'task')
AND
  EXISTS (SELECT 1 FROM entities WHERE entity_id = target_entity_id AND type = 'person');

-- Create view for task organizations
CREATE VIEW task_organizations_view AS
SELECT
  source_entity_id AS task_id,
  target_entity_id AS organization_id
FROM
  entity_relations
WHERE
  relation_type IN ('assigned_to', 'involves')
AND
  EXISTS (SELECT 1 FROM entities WHERE entity_id = source_entity_id AND type = 'task')
AND
  EXISTS (SELECT 1 FROM entities WHERE entity_id = target_entity_id AND type = 'organization');

-- Create view for task physical items
CREATE VIEW task_physical_items_view AS
SELECT
  source_entity_id AS task_id,
  target_entity_id AS physical_item_id
FROM
  entity_relations
WHERE
  relation_type IN ('requires', 'uses')
AND
  EXISTS (SELECT 1 FROM entities WHERE entity_id = source_entity_id AND type = 'task')
AND
  EXISTS (SELECT 1 FROM entities WHERE entity_id = target_entity_id AND type = 'physical_item');

-- Create view for task digital items
CREATE VIEW task_digital_items_view AS
SELECT
  source_entity_id AS task_id,
  target_entity_id AS digital_item_id
FROM
  entity_relations
WHERE
  relation_type IN ('requires', 'uses')
AND
  EXISTS (SELECT 1 FROM entities WHERE entity_id = source_entity_id AND type = 'task')
AND
  EXISTS (SELECT 1 FROM entities WHERE entity_id = target_entity_id AND type = 'digital_item');

-- Create view for organization members
CREATE VIEW organization_members_view AS
SELECT
  source_entity_id AS organization_id,
  target_entity_id AS person_id
FROM
  entity_relations
WHERE
  relation_type IN ('has_member', 'includes')
AND
  EXISTS (SELECT 1 FROM entities WHERE entity_id = source_entity_id AND type = 'organization')
AND
  EXISTS (SELECT 1 FROM entities WHERE entity_id = target_entity_id AND type = 'person');

-- Create view for person organizations
CREATE VIEW person_organizations_view AS
SELECT
  source_entity_id AS person_id,
  target_entity_id AS organization_id
FROM
  entity_relations
WHERE
  relation_type IN ('member_of', 'belongs_to')
AND
  EXISTS (SELECT 1 FROM entities WHERE entity_id = source_entity_id AND type = 'person')
AND
  EXISTS (SELECT 1 FROM entities WHERE entity_id = target_entity_id AND type = 'organization');

-- Create view for activity guidelines
CREATE VIEW activity_guidelines_view AS
SELECT
  source_entity_id AS activity_id,
  target_entity_id AS guideline_id
FROM
  entity_relations
WHERE
  relation_type = 'follows'
AND
  EXISTS (SELECT 1 FROM entities WHERE entity_id = source_entity_id AND type = 'activity')
AND
  EXISTS (SELECT 1 FROM entities WHERE entity_id = target_entity_id AND type = 'guideline');

-- Create view for task parent-child relationships
CREATE VIEW task_parent_child_view AS
SELECT
  target_entity_id AS parent_task_id,
  source_entity_id AS child_task_id
FROM
  entity_relations
WHERE
  relation_type IN ('child_of', 'subtask_of')
AND
  EXISTS (SELECT 1 FROM entities WHERE entity_id = source_entity_id AND type = 'task')
AND
  EXISTS (SELECT 1 FROM entities WHERE entity_id = target_entity_id AND type = 'task');

-- Create view for task dependencies
CREATE VIEW task_dependencies_view AS
SELECT
  source_entity_id AS task_entity_id,
  target_entity_id AS dependent_task_entity_id
FROM
  entity_relations
WHERE
  relation_type = 'depends_on'
AND
  EXISTS (SELECT 1 FROM entities WHERE entity_id = source_entity_id AND type = 'task')
AND
  EXISTS (SELECT 1 FROM entities WHERE entity_id = target_entity_id AND type = 'task');

-- Create view for physical item parent-child relationships
CREATE VIEW physical_item_hierarchy_view AS
SELECT
  source_entity_id AS parent_item_id,
  target_entity_id AS child_item_id
FROM
  entity_relations
WHERE
  relation_type IN ('contains', 'parent_of')
AND
  EXISTS (SELECT 1 FROM entities WHERE entity_id = source_entity_id AND type = 'physical_item')
AND
  EXISTS (SELECT 1 FROM entities WHERE entity_id = target_entity_id AND type = 'physical_item');

-- Create view for entity hierarchies (generic parent-child)
CREATE VIEW entity_hierarchies_view AS
SELECT
  source_entity_id AS parent_entity_id,
  target_entity_id AS child_entity_id
FROM
  entity_relations
WHERE
  relation_type IN ('parent_of', 'contains');

-- Create a materialized view for activities
CREATE MATERIALIZED VIEW activities_view AS
SELECT entity_id, title, description, user_id, created_at, updated_at
FROM entities
WHERE type = 'activity' AND archived_at IS NULL;

-- Function to refresh activities view
CREATE OR REPLACE FUNCTION refresh_activities_view()
RETURNS TRIGGER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY activities_view;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to refresh the activities view when entities change
CREATE TRIGGER refresh_activities_view_trigger
AFTER INSERT OR UPDATE OR DELETE ON entities
FOR EACH ROW
WHEN (NEW.type = 'activity' OR OLD.type = 'activity')
EXECUTE FUNCTION refresh_activities_view();

-- Create a function for semantic similarity search
CREATE OR REPLACE FUNCTION entity_similarity_search(
  query_embedding vector(1536),
  entity_types entity_type[] DEFAULT NULL,
  similarity_threshold float DEFAULT 0.7,
  max_results integer DEFAULT 10
) RETURNS TABLE (
  entity_id UUID,
  title VARCHAR,
  type entity_type,
  description TEXT,
  similarity float
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.entity_id,
    e.title,
    e.type,
    e.description,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM
    entities e
  WHERE
    e.archived_at IS NULL
    AND e.embedding IS NOT NULL
    AND (entity_types IS NULL OR e.type = ANY(entity_types))
    AND 1 - (e.embedding <=> query_embedding) > similarity_threshold
  ORDER BY
    e.embedding <=> query_embedding
  LIMIT max_results;
END;
$$;

-- Create a function to check if entity is synced with git
CREATE OR REPLACE FUNCTION is_entity_synced_with_git(
  p_entity_id UUID,
  p_git_sha VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
  current_sha VARCHAR;
BEGIN
  SELECT git_sha INTO current_sha
  FROM entities
  WHERE entity_id = p_entity_id;

  RETURN current_sha = p_git_sha;
END;
$$ LANGUAGE plpgsql;

-- Create triggers and functions

-- Function for text search vector updates
CREATE OR REPLACE FUNCTION update_digital_items_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.text, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE((SELECT markdown FROM entities WHERE entity_id = NEW.entity_id), '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.html, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_digital_items_search_vector
BEFORE INSERT OR UPDATE ON digital_items
FOR EACH ROW
EXECUTE FUNCTION update_digital_items_search_vector();

-- Function to extract tags from frontmatter for any entity with frontmatter
CREATE OR REPLACE FUNCTION extract_entity_tags()
RETURNS TRIGGER AS $$
DECLARE
  tag_name TEXT;
  tag_entity_id UUID;
  parent_tag_name TEXT;
  parent_tag_id UUID;
  tag_parts TEXT[];
  frontmatter_tags JSONB;
  extracted_tag TEXT;
BEGIN
  -- Only process entities with frontmatter and markdown
  IF NEW.frontmatter IS NOT NULL THEN
    -- Extract tags from frontmatter
    frontmatter_tags := NEW.frontmatter->'tags';

    IF frontmatter_tags IS NOT NULL AND jsonb_typeof(frontmatter_tags) = 'array' THEN
      FOR i IN 0..jsonb_array_length(frontmatter_tags)-1 LOOP
        tag_name := frontmatter_tags->i;

        -- Check if it's a hierarchical tag (parent/child format)
        IF position('/' IN tag_name) > 0 THEN
          tag_parts := string_to_array(tag_name, '/');
          parent_tag_name := tag_parts[1];
          tag_name := tag_parts[2];

          -- Find parent tag entity
          SELECT e.entity_id INTO parent_tag_id
          FROM entities e
          JOIN tags t ON e.entity_id = t.entity_id
          WHERE e.title = parent_tag_name
          AND e.user_id = NEW.user_id
          AND e.type = 'tag';

          IF parent_tag_id IS NULL THEN
            -- Create parent tag entity first
            INSERT INTO entities (
              title,
              type,
              description,
              user_id
            ) VALUES (
              parent_tag_name,
              'tag',
              'Tag: ' || parent_tag_name,
              NEW.user_id
            )
            RETURNING entity_id INTO parent_tag_id;

            -- Now create the tag record
            INSERT INTO tags (
              entity_id,
              color
            ) VALUES (
              parent_tag_id,
              NULL
            );
          END IF;

          -- Find child tag entity
          SELECT e.entity_id INTO tag_entity_id
          FROM entities e
          JOIN tags t ON e.entity_id = t.entity_id
          WHERE e.title = tag_name
          AND e.user_id = NEW.user_id
          AND e.type = 'tag';

          IF tag_entity_id IS NULL THEN
            -- Create child tag entity
            INSERT INTO entities (
              title,
              type,
              description,
              user_id
            ) VALUES (
              tag_name,
              'tag',
              'Tag: ' || tag_name,
              NEW.user_id
            )
            RETURNING entity_id INTO tag_entity_id;

            -- Now create the tag record with parent reference
            INSERT INTO tags (
              entity_id,
              parent_tag_id
            ) VALUES (
              tag_entity_id,
              parent_tag_id
            );
          ELSE
            -- Update parent if needed
            UPDATE tags
            SET parent_tag_id = parent_tag_id
            WHERE entity_id = tag_entity_id;
          END IF;
        ELSE
          -- Find simple tag entity
          SELECT e.entity_id INTO tag_entity_id
          FROM entities e
          JOIN tags t ON e.entity_id = t.entity_id
          WHERE e.title = tag_name
          AND e.user_id = NEW.user_id
          AND e.type = 'tag';

          IF tag_entity_id IS NULL THEN
            -- Create tag entity
            INSERT INTO entities (
              title,
              type,
              description,
              user_id
            ) VALUES (
              tag_name,
              'tag',
              'Tag: ' || tag_name,
              NEW.user_id
            )
            RETURNING entity_id INTO tag_entity_id;

            -- Now create the tag record
            INSERT INTO tags (
              entity_id
            ) VALUES (
              tag_entity_id
            );
          END IF;
        END IF;

        -- Link tag to entity
        INSERT INTO entity_tags (entity_id, tag_entity_id)
        VALUES (NEW.entity_id, tag_entity_id)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;

    -- Extract hashtags from markdown if available
    -- TODO check potential issue with hastags matching markdown headings
    IF NEW.markdown IS NOT NULL THEN
      FOR extracted_tag IN
        SELECT regexp_matches(NEW.markdown, '(?<!^|\n)#([a-zA-Z0-9_/-]+)', 'g')
      LOOP
        tag_name := extracted_tag;

        -- Check if it's a hierarchical tag (parent/child format)
        IF position('/' IN tag_name) > 0 THEN
          tag_parts := string_to_array(tag_name, '/');
          parent_tag_name := tag_parts[1];
          tag_name := tag_parts[2];

          -- Find parent tag entity
          SELECT e.entity_id INTO parent_tag_id
          FROM entities e
          JOIN tags t ON e.entity_id = t.entity_id
          WHERE e.title = parent_tag_name
          AND e.user_id = NEW.user_id
          AND e.type = 'tag';

          IF parent_tag_id IS NULL THEN
            -- Create parent tag entity first
            INSERT INTO entities (
              title,
              type,
              description,
              user_id
            ) VALUES (
              parent_tag_name,
              'tag',
              'Tag: ' || parent_tag_name,
              NEW.user_id
            )
            RETURNING entity_id INTO parent_tag_id;

            -- Now create the tag record
            INSERT INTO tags (
              entity_id
            ) VALUES (
              parent_tag_id
            );
          END IF;

          -- Find child tag entity
          SELECT e.entity_id INTO tag_entity_id
          FROM entities e
          JOIN tags t ON e.entity_id = t.entity_id
          WHERE e.title = tag_name
          AND e.user_id = NEW.user_id
          AND e.type = 'tag';

          IF tag_entity_id IS NULL THEN
            -- Create child tag entity
            INSERT INTO entities (
              title,
              type,
              description,
              user_id
            ) VALUES (
              tag_name,
              'tag',
              'Tag: ' || tag_name,
              NEW.user_id
            )
            RETURNING entity_id INTO tag_entity_id;

            -- Now create the tag record with parent reference
            INSERT INTO tags (
              entity_id,
              parent_tag_id
            ) VALUES (
              tag_entity_id,
              parent_tag_id
            );
          ELSE
            -- Update parent if needed
            UPDATE tags
            SET parent_tag_id = parent_tag_id
            WHERE entity_id = tag_entity_id;
          END IF;
        ELSE
          -- Find simple tag entity
          SELECT e.entity_id INTO tag_entity_id
          FROM entities e
          JOIN tags t ON e.entity_id = t.entity_id
          WHERE e.title = tag_name
          AND e.user_id = NEW.user_id
          AND e.type = 'tag';

          IF tag_entity_id IS NULL THEN
            -- Create tag entity
            INSERT INTO entities (
              title,
              type,
              description,
              user_id
            ) VALUES (
              tag_name,
              'tag',
              'Tag: ' || tag_name,
              NEW.user_id
            )
            RETURNING entity_id INTO tag_entity_id;

            -- Now create the tag record
            INSERT INTO tags (
              entity_id
            ) VALUES (
              tag_entity_id
            );
          END IF;
        END IF;

        -- Link tag to entity
        INSERT INTO entity_tags (entity_id, tag_entity_id)
        VALUES (NEW.entity_id, tag_entity_id)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entity_extract_tags
AFTER INSERT OR UPDATE ON entities
FOR EACH ROW
WHEN (NEW.frontmatter IS NOT NULL)
EXECUTE FUNCTION extract_entity_tags();

-- Function to extract observations from text content
CREATE OR REPLACE FUNCTION extract_entity_observations()
RETURNS TRIGGER AS $$
DECLARE
  observation_line TEXT;
  category TEXT;
  content TEXT;
  context TEXT;
  observation_match TEXT[];
  markdown_lines TEXT[];
  current_line TEXT;
  in_observations_section BOOLEAN := false;
BEGIN
  -- Only process entities with markdown
  IF NEW.markdown IS NOT NULL THEN
    -- Split markdown into lines for better section handling
    markdown_lines := string_to_array(NEW.markdown, E'\n');

    -- Process line by line to handle sections
    FOREACH current_line IN ARRAY markdown_lines LOOP
      -- Check for observations section
      IF current_line LIKE '## Observations' THEN
        in_observations_section := true;
        CONTINUE;
      END IF;

      -- End section if new section starts
      IF current_line LIKE '## %' AND in_observations_section THEN
        in_observations_section := false;
      END IF;

      -- Process observations in the Observations section
      IF in_observations_section AND current_line LIKE '- [%]%' THEN
        -- Extract parts using regex
        SELECT regexp_matches(current_line,
          '- \[(.*?)\] (.*?)( #([\w\-]+))?( \((.*?)\))?$') INTO observation_match;

        IF observation_match IS NOT NULL THEN
          -- Extract parts from match
          category := observation_match[1];
          content := observation_match[2];
          context := observation_match[6];

          -- Insert the observation
          INSERT INTO entity_observations (
            entity_id,
            category,
            content,
            context
          ) VALUES (
            NEW.entity_id,
            category,
            content,
            context
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entity_extract_observations
AFTER INSERT OR UPDATE ON entities
FOR EACH ROW
WHEN (NEW.markdown IS NOT NULL)
EXECUTE FUNCTION extract_entity_observations();

-- Function to extract relations from text content
CREATE OR REPLACE FUNCTION extract_entity_relations()
RETURNS TRIGGER AS $$
DECLARE
  relation_line TEXT;
  relation_type TEXT;
  target_title TEXT;
  context TEXT;
  relation_match TEXT[];
  markdown_lines TEXT[];
  current_line TEXT;
  in_relations_section BOOLEAN := false;
  target_entity_id UUID;
  target_entity_type entity_type;
  source_entity_type entity_type := NEW.type;
BEGIN
  -- Only process entities with markdown
  IF NEW.markdown IS NOT NULL THEN
    -- Split markdown into lines for better section handling
    markdown_lines := string_to_array(NEW.markdown, E'\n');

    -- Process line by line to handle sections
    FOREACH current_line IN ARRAY markdown_lines LOOP
      -- Check for relations section
      IF current_line LIKE '## Relations' THEN
        in_relations_section := true;
        CONTINUE;
      END IF;

      -- End section if new section starts
      IF current_line LIKE '## %' AND in_relations_section THEN
        in_relations_section := false;
      END IF;

      -- Process relations in the Relations section
      IF in_relations_section AND current_line LIKE '- %[[%]]%' THEN
        -- Extract parts using regex
        SELECT regexp_matches(current_line,
          '- (.*?) \[\[(.*?)\]\]( \((.*?)\))?$') INTO relation_match;

        IF relation_match IS NOT NULL THEN
          -- Extract parts from match
          relation_type := relation_match[1];
          target_title := relation_match[2];
          context := relation_match[4];

          -- Look for matching target entity
          SELECT entity_id, type INTO target_entity_id, target_entity_type
          FROM entities
          WHERE title = target_title AND user_id = NEW.user_id
          LIMIT 1;

          -- Insert the relation into entity_relations
          IF target_entity_id IS NOT NULL THEN
            INSERT INTO entity_relations (
              source_entity_id,
              target_entity_id,
              target_title,
              relation_type,
              context
            ) VALUES (
              NEW.entity_id,
              target_entity_id,
              target_title,
              relation_type,
              context
            );
          ELSIF target_title IS NOT NULL THEN
            -- Insert a relation with just the title when entity doesn't exist yet
            INSERT INTO entity_relations (
              source_entity_id,
              target_title,
              relation_type,
              context
            ) VALUES (
              NEW.entity_id,
              target_title,
              relation_type,
              context
            );
          END IF;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entity_extract_relations
AFTER INSERT OR UPDATE ON entities
FOR EACH ROW
WHEN (NEW.markdown IS NOT NULL)
EXECUTE FUNCTION extract_entity_relations();

-- Function to extract guidelines from activity frontmatter
CREATE OR REPLACE FUNCTION extract_activity_guidelines()
RETURNS TRIGGER AS $$
DECLARE
  guideline_title TEXT;
  guideline_id UUID;
  guideline_refs JSONB;
BEGIN
  -- Only process for activity entities
  IF NEW.type = 'activity' AND NEW.frontmatter->'guidelines' IS NOT NULL THEN
    -- Delete existing guideline relationships
    DELETE FROM entity_relations
    WHERE source_entity_id = NEW.entity_id
    AND relation_type = 'follows';

    -- Extract guidelines from frontmatter
    guideline_refs := NEW.frontmatter->'guidelines';

    IF jsonb_typeof(guideline_refs) = 'array' THEN
      FOR i IN 0..jsonb_array_length(guideline_refs)-1 LOOP
        guideline_title := guideline_refs->i;

        -- Find guideline entity by title
        SELECT entity_id INTO guideline_id
        FROM entities
        WHERE title = guideline_title
        AND type = 'guideline'
        AND user_id = NEW.user_id
        LIMIT 1;

        -- Link guideline to activity if found
        IF guideline_id IS NOT NULL THEN
          INSERT INTO entity_relations (
            source_entity_id,
            target_entity_id,
            target_title,
            relation_type
          ) VALUES (
            NEW.entity_id,
            guideline_id,
            guideline_title,
            'follows'
          ) ON CONFLICT DO NOTHING;
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for activity guideline extraction
CREATE TRIGGER activity_extract_guidelines
AFTER INSERT OR UPDATE ON entities
FOR EACH ROW
WHEN (NEW.type = 'activity')
EXECUTE FUNCTION extract_activity_guidelines();

-- Function to extract guideline data from frontmatter
CREATE OR REPLACE FUNCTION extract_guideline_data()
RETURNS TRIGGER AS $$
DECLARE
  status TEXT;
  effective_date DATE;
BEGIN
  -- Only process for guideline entities
  IF NEW.type = 'guideline' AND NEW.frontmatter IS NOT NULL THEN
    -- Extract guideline status from frontmatter
    IF NEW.frontmatter->'guideline_status' IS NOT NULL THEN
      status := NEW.frontmatter->>'guideline_status';
    END IF;

    -- Extract effective date from frontmatter
    IF NEW.frontmatter->'effective_date' IS NOT NULL THEN
      effective_date := (NEW.frontmatter->>'effective_date')::DATE;
    END IF;

    -- Insert or update guidelines table
    INSERT INTO guidelines (entity_id, guideline_status, effective_date)
    VALUES (NEW.entity_id, status, effective_date)
    ON CONFLICT (entity_id) DO UPDATE
    SET
      guideline_status = EXCLUDED.guideline_status,
      effective_date = EXCLUDED.effective_date;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for guideline data extraction
CREATE TRIGGER guideline_extract_data
AFTER INSERT OR UPDATE ON entities
FOR EACH ROW
WHEN (NEW.type = 'guideline')
EXECUTE FUNCTION extract_guideline_data();

-- Function for audit logging
CREATE OR REPLACE FUNCTION process_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  audit_row audit_log;
  entity_user_id UUID;
BEGIN
  -- Get the user ID if available
  IF TG_OP = 'DELETE' THEN
    entity_user_id := OLD.user_id;
  ELSE
    entity_user_id := NEW.user_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    audit_row = ROW(
      uuid_generate_v1(),
      TG_TABLE_NAME::VARCHAR,
      OLD.entity_id,
      'D',
      row_to_json(OLD),
      NULL,
      entity_user_id,
      NOW()
    );
  ELSIF TG_OP = 'UPDATE' THEN
    audit_row = ROW(
      uuid_generate_v1(),
      TG_TABLE_NAME::VARCHAR,
      NEW.entity_id,
      'U',
      row_to_json(OLD),
      row_to_json(NEW),
      entity_user_id,
      NOW()
    );
  ELSIF TG_OP = 'INSERT' THEN
    audit_row = ROW(
      uuid_generate_v1(),
      TG_TABLE_NAME::VARCHAR,
      NEW.entity_id,
      'I',
      NULL,
      row_to_json(NEW),
      entity_user_id,
      NOW()
    );
  END IF;

  INSERT INTO audit_log VALUES (audit_row.*);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers to main tables
CREATE TRIGGER entities_audit
AFTER INSERT OR UPDATE OR DELETE ON entities
FOR EACH ROW EXECUTE FUNCTION process_audit_log();

-- Function to extract from frontmatter (generalized)
CREATE OR REPLACE FUNCTION extract_entity_frontmatter_relations()
RETURNS TRIGGER AS $$
DECLARE
  property_keys TEXT[];
  current_key TEXT;
  frontmatter_array JSONB;
  related_entity_title TEXT;
  related_entity_id UUID;
  related_entity_type entity_type;
  relation_type TEXT;
BEGIN
  -- Only process entities with frontmatter
  IF NEW.frontmatter IS NOT NULL THEN
    -- Define which properties to process based on entity type
    IF NEW.type = 'task' THEN
      property_keys := ARRAY['persons', 'physical_items', 'digital_items', 'parent_tasks', 'dependent_tasks', 'activities', 'organizations'];
    ELSIF NEW.type = 'physical_item' THEN
      property_keys := ARRAY['parent_items', 'child_items'];
    ELSIF NEW.type = 'person' THEN
      property_keys := ARRAY['organizations'];
    ELSIF NEW.type = 'organization' THEN
      property_keys := ARRAY['members'];
    ELSIF NEW.type = 'activity' THEN
      property_keys := ARRAY['guidelines'];
    END IF;

    -- Process each property
    FOREACH current_key IN ARRAY property_keys LOOP
      IF NEW.frontmatter->current_key IS NOT NULL AND jsonb_typeof(NEW.frontmatter->current_key) = 'array' THEN
        frontmatter_array := NEW.frontmatter->current_key;

        -- Map property names to relation types
        CASE
          WHEN NEW.type = 'task' AND current_key = 'persons' THEN relation_type := 'assigned_to';
          WHEN NEW.type = 'task' AND current_key = 'physical_items' THEN relation_type := 'requires';
          WHEN NEW.type = 'task' AND current_key = 'digital_items' THEN relation_type := 'requires';
          WHEN NEW.type = 'task' AND current_key = 'parent_tasks' THEN relation_type := 'child_of';
          WHEN NEW.type = 'task' AND current_key = 'dependent_tasks' THEN relation_type := 'depends_on';
          WHEN NEW.type = 'task' AND current_key = 'activities' THEN relation_type := 'executes';
          WHEN NEW.type = 'task' AND current_key = 'organizations' THEN relation_type := 'involves';
          WHEN NEW.type = 'physical_item' AND current_key = 'parent_items' THEN relation_type := 'part_of';
          WHEN NEW.type = 'physical_item' AND current_key = 'child_items' THEN relation_type := 'contains';
          WHEN NEW.type = 'person' AND current_key = 'organizations' THEN relation_type := 'member_of';
          WHEN NEW.type = 'organization' AND current_key = 'members' THEN relation_type := 'has_member';
          WHEN NEW.type = 'activity' AND current_key = 'guidelines' THEN relation_type := 'follows';
          ELSE relation_type := 'relates_to';
        END CASE;

        -- Process array items
        FOR i IN 0..jsonb_array_length(frontmatter_array)-1 LOOP
          related_entity_title := frontmatter_array->i;

          -- Find the related entity
          SELECT entity_id, type INTO related_entity_id, related_entity_type
          FROM entities
          WHERE title = related_entity_title AND user_id = NEW.user_id;

          -- Insert relation if entity found
          IF related_entity_id IS NOT NULL THEN
            INSERT INTO entity_relations (
              source_entity_id,
              target_entity_id,
              target_title,
              relation_type
            ) VALUES (
              NEW.entity_id,
              related_entity_id,
              related_entity_title,
              relation_type
            ) ON CONFLICT DO NOTHING;
          ELSIF related_entity_title IS NOT NULL THEN
            -- Insert a relation with just the title when entity doesn't exist yet
            INSERT INTO entity_relations (
              source_entity_id,
              target_title,
              relation_type
            ) VALUES (
              NEW.entity_id,
              related_entity_title,
              relation_type
            );
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for frontmatter relation extraction
CREATE TRIGGER entity_extract_frontmatter_relations
AFTER INSERT OR UPDATE ON entities
FOR EACH ROW
EXECUTE FUNCTION extract_entity_frontmatter_relations();