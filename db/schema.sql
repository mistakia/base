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

-- Block tables
DROP TABLE IF EXISTS entity_blocks CASCADE;
DROP TABLE IF EXISTS block_relationships CASCADE;
DROP TABLE IF EXISTS block_attributes CASCADE;
DROP TABLE IF EXISTS blocks CASCADE;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

DROP TYPE IF EXISTS entity_type CASCADE;
DROP TYPE IF EXISTS task_status_type CASCADE;
DROP TYPE IF EXISTS priority_type CASCADE;
DROP TYPE IF EXISTS importance_type CASCADE;
DROP TYPE IF EXISTS frequency_type CASCADE;
DROP TYPE IF EXISTS guideline_status_type CASCADE;
DROP TYPE IF EXISTS block_type CASCADE;

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

-- Block types
CREATE TYPE block_type AS ENUM (
  'markdown_file',
  'heading',
  'paragraph',
  'list',
  'list_item',
  'code',
  'blockquote',
  'table',
  'table_row',
  'table_cell',
  'image',
  'thematic_break',
  'callout',
  'bookmark',
  'equation',
  'file',
  'video',
  'html_block'
);

CREATE TABLE blocks (
  block_id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
  block_cid TEXT NOT NULL UNIQUE,   -- Content ID (multihash)
  type block_type NOT NULL,
  content TEXT,
  user_id UUID NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Search capability
  embedding vector(1536),
  search_vector tsvector,

  -- Block metadata fields
  position_start_line INTEGER,
  position_start_character INTEGER,
  position_end_line INTEGER,
  position_end_character INTEGER,

  CONSTRAINT check_updated_at CHECK (
    updated_at IS NULL OR updated_at >= created_at
  )
);

-- Block attributes (type-specific properties)
CREATE TABLE block_attributes (
  attribute_id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
  block_id UUID NOT NULL REFERENCES blocks (block_id) ON DELETE CASCADE,
  key VARCHAR(255) NOT NULL,
  value TEXT NOT NULL,
  UNIQUE (block_id, key)
);

-- Block relationships
CREATE TABLE block_relationships (
  relationship_id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
  source_block_id UUID NOT NULL REFERENCES blocks (block_id) ON DELETE CASCADE,
  target_block_id UUID NOT NULL REFERENCES blocks (block_id) ON DELETE CASCADE,
  relationship_type VARCHAR(50) NOT NULL,
  UNIQUE (source_block_id, target_block_id, relationship_type)
);

-- Join table connecting entities and blocks
CREATE TABLE entity_blocks (
  entity_id UUID NOT NULL REFERENCES entities (entity_id) ON DELETE CASCADE,
  block_id UUID NOT NULL REFERENCES blocks (block_id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (entity_id, block_id)
);

-- Indexes for block tables
CREATE INDEX idx_blocks_block_cid ON blocks (block_cid);
CREATE INDEX idx_blocks_type ON blocks (type);
CREATE INDEX idx_blocks_user_id ON blocks (user_id);
CREATE INDEX idx_blocks_created_at ON blocks (created_at DESC);
CREATE INDEX idx_blocks_updated_at ON blocks (updated_at DESC);
CREATE INDEX idx_entity_blocks_entity_id ON entity_blocks (entity_id);
CREATE INDEX idx_entity_blocks_block_id ON entity_blocks (block_id);
CREATE INDEX idx_block_relationships_source ON block_relationships (source_block_id);
CREATE INDEX idx_block_relationships_target ON block_relationships (target_block_id);
CREATE INDEX idx_block_relationships_type ON block_relationships (relationship_type);
CREATE INDEX idx_blocks_search ON blocks USING gin(search_vector);
CREATE INDEX idx_blocks_embedding ON blocks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Update search vector for full text search
CREATE OR REPLACE FUNCTION update_block_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_block_search_vector
BEFORE INSERT OR UPDATE ON blocks
FOR EACH ROW EXECUTE FUNCTION update_block_search_vector();

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
  file_mime_type VARCHAR(255),
  file_uri VARCHAR(500),
  file_size VARCHAR(50),
  file_cid VARCHAR(100),
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
  color VARCHAR(50)
);

-- Create views for convenient access
CREATE VIEW active_entities AS
SELECT * FROM entities
WHERE archived_at IS NULL;

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

-- Create a unique index on entities for tags by type, title, and user_id
CREATE UNIQUE INDEX idx_unique_tag_entities ON entities (title, user_id)
WHERE type = 'tag';
CREATE UNIQUE INDEX idx_unique_entity_relations ON entity_relations (source_entity_id, target_entity_id, relation_type);

-- Create indices to improve query performance
CREATE INDEX idx_entities_type ON entities (type);
CREATE INDEX idx_entities_user_id ON entities (user_id);
CREATE INDEX idx_entities_created_at ON entities (created_at DESC);
CREATE INDEX idx_entities_updated_at ON entities (updated_at DESC);
CREATE INDEX idx_entities_archived_at ON entities (archived_at);
CREATE INDEX idx_entities_git_sha ON entities (git_sha);
CREATE INDEX idx_entity_embedding ON entities USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
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

CREATE TRIGGER entities_audit
AFTER INSERT OR UPDATE OR DELETE ON entities
FOR EACH ROW EXECUTE FUNCTION process_audit_log();

CREATE TRIGGER entity_blocks_audit
AFTER INSERT OR UPDATE OR DELETE ON entity_blocks
FOR EACH ROW EXECUTE FUNCTION process_audit_log();

-- Query function for block semantic search
CREATE OR REPLACE FUNCTION block_similarity_search(
  query_embedding vector(1536),
  block_types block_type[] DEFAULT NULL,
  similarity_threshold float DEFAULT 0.7,
  max_results integer DEFAULT 10
) RETURNS TABLE (
  block_id UUID,
  block_cid TEXT,
  type block_type,
  content TEXT,
  similarity float
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.block_id,
    b.block_cid,
    b.type,
    b.content,
    1 - (b.embedding <=> query_embedding) AS similarity
  FROM
    blocks b
  WHERE
    b.embedding IS NOT NULL
    AND (block_types IS NULL OR b.type = ANY(block_types))
    AND 1 - (b.embedding <=> query_embedding) > similarity_threshold
  ORDER BY
    b.embedding <=> query_embedding
  LIMIT max_results;
END;
$$;
