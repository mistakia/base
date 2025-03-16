DROP TABLE
  IF EXISTS database_table_views CASCADE;

DROP TABLE
  IF EXISTS database_table_tags CASCADE;

DROP TABLE
  IF EXISTS database_tables CASCADE;

DROP TABLE
  IF EXISTS task_digital_items CASCADE;

DROP TABLE
  IF EXISTS digital_item_tags CASCADE;

DROP TABLE
  IF EXISTS digital_items CASCADE;

DROP TABLE
  IF EXISTS physical_item_tags CASCADE;

DROP TABLE
  IF EXISTS task_physical_items CASCADE;

DROP TABLE
  IF EXISTS physical_item_child_items CASCADE;

DROP TABLE
  IF EXISTS physical_items CASCADE;

DROP TABLE
  IF EXISTS physical_locations CASCADE;

DROP TABLE
  IF EXISTS task_persons CASCADE;

DROP TABLE
  IF EXISTS organization_persons CASCADE;

DROP TABLE
  IF EXISTS persons CASCADE;

DROP TABLE
  IF EXISTS task_organizations CASCADE;

DROP TABLE
  IF EXISTS organizations CASCADE;

DROP TABLE
  IF EXISTS task_activities CASCADE;

DROP TABLE
  IF EXISTS activities CASCADE;

DROP TABLE
  IF EXISTS task_dependencies CASCADE;

DROP TABLE
  IF EXISTS task_parents CASCADE;

DROP TABLE
  IF EXISTS task_tags CASCADE;

DROP TABLE
  IF EXISTS tasks CASCADE;

DROP TABLE
  IF EXISTS tags CASCADE;

DROP TABLE
  IF EXISTS users CASCADE;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE
  users (
    user_id UUID DEFAULT uuid_generate_v1 () PRIMARY KEY,
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

CREATE TABLE
  tags (
    tag_id UUID DEFAULT uuid_generate_v1 () PRIMARY KEY,
    tag_name VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMP,
    CONSTRAINT check_updated_at CHECK (
      updated_at IS NULL
      OR updated_at >= created_at
    ),
    CONSTRAINT check_archived_at CHECK (
      archived_at IS NULL
      OR archived_at >= updated_at
    ),
    UNIQUE (tag_name, user_id)
  );

CREATE TABLE
  tasks (
    task_id UUID DEFAULT uuid_generate_v1 () PRIMARY KEY,
    external_id VARCHAR(255),
    external_url VARCHAR(255),
    text_input TEXT NOT NULL,
    status VARCHAR(255) DEFAULT 'No status' CHECK (
      status IN (
        'No status',
        'Waiting',
        'Paused',
        'Planned',
        'Started',
        'In Progress',
        'Completed',
        'Cancelled',
        'Blocked'
      )
    ),
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    snooze_until TIMESTAMP,
    user_id UUID NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT check_planned_start CHECK (
      planned_start IS NULL
      OR planned_start >= created_at
    ),
    CONSTRAINT check_planned_finish CHECK (
      planned_finish IS NULL
      OR planned_finish >= planned_start
    ),
    CONSTRAINT check_started_at CHECK (
      started_at IS NULL
      OR started_at >= updated_at
    ),
    CONSTRAINT check_finished_at CHECK (
      finished_at IS NULL
      OR finished_at >= started_at
    ),
    CONSTRAINT check_updated_at CHECK (
      updated_at IS NULL
      OR updated_at >= created_at
    ),
    CONSTRAINT check_estimated_duration CHECK (
      estimated_total_duration IS NULL
      OR estimated_total_duration >= COALESCE(estimated_preparation_duration, 0) + COALESCE(estimated_execution_duration, 0) + COALESCE(estimated_cleanup_duration, 0)
    ),
    CONSTRAINT check_finish_by CHECK (
      finish_by IS NULL
      OR finish_by >= created_at
    ),
    UNIQUE (user_id, external_id)
  );

CREATE TABLE
  task_tags (
    task_id UUID NOT NULL REFERENCES tasks (task_id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags (tag_id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, tag_id)
  );

CREATE TABLE
  task_parents (
    parent_task_id UUID NOT NULL REFERENCES tasks (task_id) ON DELETE CASCADE,
    child_task_id UUID NOT NULL REFERENCES tasks (task_id) ON DELETE CASCADE,
    PRIMARY KEY (parent_task_id, child_task_id)
  );

CREATE TABLE
  task_dependencies (
    task_id UUID NOT NULL REFERENCES tasks (task_id) ON DELETE CASCADE,
    dependent_task_id UUID NOT NULL REFERENCES tasks (task_id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, dependent_task_id)
  );

CREATE TABLE
  activities (
    activity_id UUID DEFAULT uuid_generate_v1 () PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

CREATE TABLE
  task_activities (
    activity_id UUID NOT NULL REFERENCES activities (activity_id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks (task_id) ON DELETE CASCADE,
    PRIMARY KEY (activity_id, task_id)
  );

CREATE TABLE
  organizations (
    organization_id UUID DEFAULT uuid_generate_v1 () PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    website_url VARCHAR(255),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

CREATE TABLE
  task_organizations (
    organization_id UUID NOT NULL REFERENCES organizations (organization_id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks (task_id) ON DELETE CASCADE,
    PRIMARY KEY (organization_id, task_id)
  );

CREATE TABLE
  persons (
    person_id UUID DEFAULT uuid_generate_v1 () PRIMARY KEY,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    mobile_phone VARCHAR(255),
    website_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

CREATE TABLE
  organization_persons (
    person_id UUID NOT NULL REFERENCES persons (person_id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations (organization_id) ON DELETE CASCADE,
    PRIMARY KEY (person_id, organization_id)
  );

CREATE TABLE
  task_persons (
    person_id UUID NOT NULL REFERENCES persons (person_id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks (task_id) ON DELETE CASCADE,
    PRIMARY KEY (person_id, task_id)
  );

CREATE TABLE
  physical_locations (
    location_id UUID PRIMARY KEY,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    name VARCHAR(255),
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
    mail_state2 TEXT,
    mail_zip TEXT,
    mail_country TEXT,
    mail_urbanization TEXT
  );

CREATE INDEX index_lat_lon ON physical_locations (latitude, longitude);

CREATE TABLE
  physical_items (
    physical_item_id UUID DEFAULT uuid_generate_v1 () PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    location_id UUID REFERENCES physical_locations (location_id) ON DELETE SET NULL,
    serial_number VARCHAR(255),
    model_number VARCHAR(255),
    manufacturer VARCHAR(255),
    storage_location VARCHAR(255),
    CONSTRAINT check_updated_at CHECK (
      updated_at IS NULL
      OR updated_at >= created_at
    )
  );

CREATE TABLE
  physical_item_child_items (
    parent_item_id UUID NOT NULL REFERENCES physical_items (physical_item_id) ON DELETE CASCADE,
    child_item_id UUID NOT NULL REFERENCES physical_items (physical_item_id) ON DELETE CASCADE,
    PRIMARY KEY (parent_item_id, child_item_id)
  );

CREATE TABLE
  physical_item_tags (
    physical_item_id UUID NOT NULL REFERENCES physical_items (physical_item_id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags (tag_id) ON DELETE CASCADE,
    PRIMARY KEY (physical_item_id, tag_id)
  );

CREATE TABLE
  task_physical_items (
    physical_item_id UUID NOT NULL REFERENCES physical_items (physical_item_id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks (task_id) ON DELETE CASCADE,
    PRIMARY KEY (physical_item_id, task_id)
  );

CREATE TABLE
  digital_items (
    digital_item_id UUID DEFAULT uuid_generate_v1 () PRIMARY KEY,
    ipfs_hash VARCHAR(100) NOT NULL UNIQUE,
    text TEXT,
    markdown TEXT,
    html TEXT,
    href VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

CREATE TABLE
  digital_item_tags (
    digital_item_id UUID NOT NULL REFERENCES digital_items (digital_item_id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags (tag_id) ON DELETE CASCADE,
    PRIMARY KEY (digital_item_id, tag_id)
  );

CREATE TABLE
  task_digital_items (
    digital_item_id UUID NOT NULL REFERENCES digital_items (digital_item_id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks (task_id) ON DELETE CASCADE,
    PRIMARY KEY (digital_item_id, task_id)
  );

CREATE TABLE
  database_tables (
    database_table_id UUID DEFAULT uuid_generate_v1 () PRIMARY KEY,
    table_name VARCHAR(255) NOT NULL,
    table_description TEXT,
    user_id UUID NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_updated_at CHECK (
      updated_at IS NULL
      OR updated_at >= created_at
    ),
    UNIQUE (table_name, user_id)
  );

CREATE TABLE
  database_table_tags (
    database_table_id UUID NOT NULL REFERENCES database_tables (database_table_id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags (tag_id) ON DELETE CASCADE,
    PRIMARY KEY (database_table_id, tag_id)
  );

CREATE TABLE
  database_table_views (
    view_id UUID DEFAULT uuid_generate_v1 () PRIMARY KEY,
    view_name VARCHAR(30) NOT NULL,
    view_description TEXT,
    table_name VARCHAR(255) NOT NULL,
    table_state JSONB,
    user_id UUID NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_updated_at CHECK (
      updated_at IS NULL
      OR updated_at >= created_at
    ),
    UNIQUE (view_name, table_name, user_id)
  );

CREATE INDEX idx_tag_name ON tags (tag_name);
