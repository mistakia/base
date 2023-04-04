SET
  FOREIGN_KEY_CHECKS = 0;

DROP TABLE
  IF EXISTS `users`;

CREATE TABLE
  `users` (
    `user_id` binary(16) DEFAULT (UUID_TO_BIN (UUID ())) COMMENT 'UUIDv1',
    `public_key` varchar(64) NOT NULL COMMENT 'public key of user (64 hex characters)',
    `username` varchar(255) NOT NULL,
    `email` varchar(255) DEFAULT NULL,
    `created_at` int (11) DEFAULT (UNIX_TIMESTAMP ()),
    `updated_at` int (11) DEFAULT (UNIX_TIMESTAMP ()),
    check (
      updated_at is null
      or updated_at >= created_at
    ),
    PRIMARY KEY (`user_id`),
    UNIQUE KEY `public_key` (`public_key`),
    UNIQUE KEY `username` (`username`)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

DROP
  TRIGGER IF EXISTS `update_users_updated_at`;

CREATE TRIGGER `update_users_updated_at` BEFORE
UPDATE
  ON `users` FOR EACH ROW
SET
  NEW.updated_at = (UNIX_TIMESTAMP ());

DROP TABLE
  IF EXISTS `folders`;

CREATE TABLE
  `folders` (
    `folder_id` binary(16) DEFAULT (UUID_TO_BIN (UUID ())) COMMENT 'UUIDv1',
    `folder_path` varchar(255) NOT NULL COMMENT 'format: /<user_id>/<folder1>/<folder2>/<folder3>',
    `user_id` binary(16) NOT NULL,
    `parent_folder_id` binary(16) DEFAULT NULL,
    `name` varchar(255) NOT NULL,
    `description` text DEFAULT NULL,
    `created_at` int (11) DEFAULT (UNIX_TIMESTAMP ()),
    `updated_at` int (11) DEFAULT (UNIX_TIMESTAMP ()),
    `archived_at` int (11) DEFAULT NULL,
    check (
      updated_at is null
      or updated_at >= created_at
    ),
    check (
      archived_at is null
      or archived_at >= updated_at
    ),
    PRIMARY KEY (`folder_path`),
    UNIQUE KEY (`folder_id`),
    FOREIGN KEY (`parent_folder_id`) REFERENCES `folders` (`folder_id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

DROP
  TRIGGER IF EXISTS `update_folders_updated_at`;

CREATE TRIGGER `update_folders_updated_at` BEFORE
UPDATE
  ON `folders` FOR EACH ROW
SET
  NEW.updated_at = (UNIX_TIMESTAMP ());

DROP TABLE
  IF EXISTS `tasks`;

CREATE TABLE
  `tasks` (
    `task_id` binary(16) DEFAULT (UUID_TO_BIN (UUID ())) COMMENT 'UUIDv1',
    `text_input` text NOT NULL COMMENT 'user text input',
    `status` varchar(255) DEFAULT 'Planned' check (
      status in (
        'Planned',
        'Started',
        'In Progress',
        'Completed',
        'Cancelled',
        'On Hold',
        'Blocked'
      )
    ) COMMENT 'status of task',
    `deadline_text_input` text DEFAULT NULL COMMENT 'user text input for deadline',
    `deadline` int (11) DEFAULT NULL,
    `estimated_total_duration` int (11) DEFAULT NULL,
    `estimated_preparation_duration` int (11) DEFAULT NULL,
    `estimated_execution_duration` int (11) DEFAULT NULL,
    `estimated_cleanup_duration` int (11) DEFAULT NULL,
    `actual_duration` int (11) unsigned DEFAULT NULL,
    `planned_start` int (11) DEFAULT NULL,
    `planned_finish` int (11) DEFAULT NULL,
    `started_at` int (11) DEFAULT NULL,
    `finished_at` int (11) DEFAULT NULL,
    `created_at` int (11) DEFAULT (UNIX_TIMESTAMP ()),
    `updated_at` int (11) DEFAULT (UNIX_TIMESTAMP ()),
    `user_id` binary(16) NOT NULL,
    check (
      planned_start is null
      or planned_start >= created_at
    ),
    check (
      planned_finish is null
      or planned_finish >= planned_start
    ),
    check (
      started_at is null
      or started_at >= updated_at
    ),
    check (
      finished_at is null
      or finished_at >= started_at
    ),
    check (
      updated_at is null
      or updated_at >= created_at
    ),
    check (
      estimated_total_duration is null
      or estimated_total_duration >= estimated_preparation_duration + estimated_execution_duration + estimated_cleanup_duration
    ),
    check (
      deadline is null
      or deadline >= created_at
    ),
    PRIMARY KEY (`task_id`),
    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

DROP TABLE
  IF EXISTS `task_folders`;

CREATE TABLE
  `task_folders` (
    `task_id` binary(16) NOT NULL,
    `parent_folder_id` binary(16) NOT NULL,
    FOREIGN KEY (`parent_folder_id`) REFERENCES `folders` (`folder_id`) ON DELETE CASCADE,
    FOREIGN KEY (`task_id`) REFERENCES `tasks` (`task_id`) ON DELETE CASCADE
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

DROP TABLE
  IF EXISTS `task_parents`;

CREATE TABLE
  `task_parents` (
    `parent_task_id` binary(16) NOT NULL,
    `child_task_id` binary(16) NOT NULL,
    FOREIGN KEY (`parent_task_id`) REFERENCES `tasks` (`task_id`) ON DELETE CASCADE,
    FOREIGN KEY (`child_task_id`) REFERENCES `tasks` (`task_id`) ON DELETE CASCADE
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

DROP TABLE
  IF EXISTS `task_dependencies`;

CREATE TABLE
  `task_dependencies` (
    `task_id` binary(16) NOT NULL,
    `dependent_task_id` binary(16) NOT NULL,
    FOREIGN KEY (`task_id`) REFERENCES `tasks` (`task_id`) ON DELETE CASCADE,
    FOREIGN KEY (`dependent_task_id`) REFERENCES `tasks` (`task_id`) ON DELETE CASCADE
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

DROP TABLE
  IF EXISTS `activities`;

CREATE TABLE
  `activities` (
    `activity_id` binary(16) DEFAULT (UUID_TO_BIN (UUID ())) COMMENT 'UUIDv1',
    `name` varchar(255) NOT NULL,
    `description` text DEFAULT NULL,
    `created_at` int (11) DEFAULT NULL,
    PRIMARY KEY (`activity_id`)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

DROP TABLE
  IF EXISTS `task_activities`;

CREATE TABLE
  `task_activities` (
    `activity_id` binary(16) NOT NULL,
    `task_id` binary(16) NOT NULL,
    FOREIGN KEY (`activity_id`) REFERENCES `activities` (`activity_id`) ON DELETE CASCADE,
    FOREIGN KEY (`task_id`) REFERENCES `tasks` (`task_id`) ON DELETE CASCADE
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

DROP TABLE
  IF EXISTS `organizations`;

CREATE TABLE
  `organizations` (
    `organization_id` binary(16) DEFAULT (UUID_TO_BIN (UUID ())) COMMENT 'UUIDv1',
    `name` varchar(255) NOT NULL,
    `website_url` varchar(255) DEFAULT NULL,
    `description` text DEFAULT NULL,
    `created_at` int (11) DEFAULT (UNIX_TIMESTAMP ()),
    PRIMARY KEY (`organization_id`)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

DROP TABLE
  IF EXISTS `task_organizations`;

CREATE TABLE
  `task_organizations` (
    `organization_id` binary(16) NOT NULL,
    `task_id` binary(16) NOT NULL,
    FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`organization_id`) ON DELETE CASCADE,
    FOREIGN KEY (`task_id`) REFERENCES `tasks` (`task_id`) ON DELETE CASCADE
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

DROP TABLE
  IF EXISTS `persons`;

CREATE TABLE
  `persons` (
    `person_id` binary(16) DEFAULT (UUID_TO_BIN (UUID ())) COMMENT 'UUIDv1',
    `first_name` varchar(255) NOT NULL,
    `last_name` varchar(255) NOT NULL,
    `email` varchar(255) DEFAULT NULL,
    `mobile_phone` varchar(255) DEFAULT NULL,
    `website_url` varchar(255) DEFAULT NULL,
    `created_at` int (11) DEFAULT (UNIX_TIMESTAMP ()),
    PRIMARY KEY (`person_id`)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

DROP TABLE
  IF EXISTS `organization_persons`;

CREATE TABLE
  `organization_persons` (
    `person_id` binary(16) NOT NULL,
    `organization_id` binary(16) NOT NULL,
    FOREIGN KEY (`person_id`) REFERENCES `persons` (`person_id`) ON DELETE CASCADE,
    FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`organization_id`) ON DELETE CASCADE
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

DROP TABLE
  IF EXISTS `task_persons`;

CREATE TABLE
  `task_persons` (
    `person_id` binary(16) NOT NULL,
    `task_id` binary(16) NOT NULL,
    FOREIGN KEY (`person_id`) REFERENCES `persons` (`person_id`) ON DELETE CASCADE,
    FOREIGN KEY (`task_id`) REFERENCES `tasks` (`task_id`) ON DELETE CASCADE
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

DROP TABLE
  IF EXISTS `physical_items`;

CREATE TABLE
  `physical_items` (
    `physical_item_id` binary(16) DEFAULT (UUID_TO_BIN (UUID ())) COMMENT 'UUIDv1',
    `name` varchar(255) NOT NULL,
    `description` text DEFAULT NULL,
    `created_at` int (11) DEFAULT (UNIX_TIMESTAMP ()),
    `updated_at` int (11) DEFAULT (UNIX_TIMESTAMP ()),
    `location_id` binary(16) DEFAULT NULL,
    `serial_number` varchar(255) DEFAULT NULL,
    `model_number` varchar(255) DEFAULT NULL,
    `manufacturer` varchar(255) DEFAULT NULL,
    `storage_location` varchar(255) DEFAULT NULL,
    check (
      updated_at is null
      or updated_at >= created_at
    ),
    FOREIGN KEY (`location_id`) REFERENCES `physical_locations` (`location_id`) ON DELETE SET NULL,
    PRIMARY KEY (`physical_item_id`)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

DROP TABLE
  IF EXISTS `physical_item_child_items`;

CREATE TABLE
  `physical_item_child_items` (
    `parent_item_id` binary(16) NOT NULL,
    `child_item_id` binary(16) NOT NULL,
    FOREIGN KEY (`parent_item_id`) REFERENCES `physical_items` (`physical_item_id`) ON DELETE CASCADE,
    FOREIGN KEY (`child_item_id`) REFERENCES `physical_items` (`physical_item_id`) ON DELETE CASCADE
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

DROP TABLE
  IF EXISTS `physical_item_folders`;

CREATE TABLE
  `physical_item_folders` (
    `physical_item_id` binary(16) NOT NULL,
    `parent_folder_id` binary(16) NOT NULL,
    FOREIGN KEY (`parent_folder_id`) REFERENCES `folders` (`folder_id`) ON DELETE CASCADE,
    FOREIGN KEY (`physical_item_id`) REFERENCES `physical_items` (`physical_item_id`) ON DELETE CASCADE
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

DROP TABLE
  IF EXISTS `task_physical_items`;

CREATE TABLE
  `task_physical_items` (
    `physical_item_id` binary(16) NOT NULL,
    `task_id` binary(16) NOT NULL,
    FOREIGN KEY (`physical_item_id`) REFERENCES `physical_items` (`physical_item_id`) ON DELETE CASCADE,
    FOREIGN KEY (`task_id`) REFERENCES `tasks` (`task_id`) ON DELETE CASCADE
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

DROP TABLE
  IF EXISTS `physical_locations`;

CREATE TABLE
  `physical_locations` (
    `location_id` binary(16) NOT NULL COMMENT 'format: xxhash(`/latitude/longitude`)',
    `latitude` DECIMAL(10, 8) COMMENT 'latitude decimal coordinate',
    `longitude` DECIMAL(11, 8) COMMENT 'longitude decimal coordinate',
    `name` varchar(255),
    `mail_address` text COMMENT 'Mailing Address',
    `mail_address2` text COMMENT 'Mailing Address Second Line',
    `mail_careof` text COMMENT 'Mailing Address Care of',
    `mail_street_number` text COMMENT 'Mailing Address Street Number',
    `mail_street_prefix` text COMMENT 'Mailing Address Street Prefix',
    `mail_street_name` text COMMENT 'Mailing Address Street Name',
    `mail_street_type` text COMMENT 'Mailing Address Street Type',
    `mail_street_suffix` text COMMENT 'Mailing Address Street Suffix',
    `mail_unit_number` text COMMENT 'Mailing Address Unit Number',
    `mail_city` text COMMENT 'Mailing Address City',
    `mail_state2` text COMMENT 'Mailing Address State',
    `mail_zip` text COMMENT 'Mailing Address ZIP Code',
    `mail_country` text COMMENT 'Mailing Address Country',
    `mail_urbanization` text COMMENT 'Mailing Address Urbanizacion (Puerto Rico)',
    PRIMARY KEY (`location_id`),
    KEY `index_lat_lon` (`latitude`, `longitude`)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

DROP TABLE
  IF EXISTS `digital_items`;

CREATE TABLE
  `digital_items` (
    `digital_item_id` binary(16) DEFAULT (UUID_TO_BIN (UUID ())) COMMENT 'UUIDv1',
    `ipfs_hash` varchar(100) NOT NULL COMMENT 'used as id',
    /* TODO figure out length */
    `text` text DEFAULT NULL,
    `markdown` text DEFAULT NULL,
    `html` text DEFAULT NULL,
    `href` varchar(255) DEFAULT NULL,
    `created_at` int (11) DEFAULT NULL,
    PRIMARY KEY (`digital_item_id`),
    UNIQUE KEY `ipfs_hash` (`ipfs_hash`)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

DROP TABLE
  IF EXISTS `digital_item_folders`;

CREATE TABLE
  `digital_item_folders` (
    `digital_item_id` binary(16) NOT NULL,
    `parent_folder_id` binary(16) NOT NULL,
    FOREIGN KEY (`parent_folder_id`) REFERENCES `folders` (`folder_id`) ON DELETE CASCADE,
    FOREIGN KEY (`digital_item_id`) REFERENCES `digital_items` (`digital_item_id`) ON DELETE CASCADE
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

DROP TABLE
  IF EXISTS `task_digital_items`;

CREATE TABLE
  `task_digital_items` (
    `digital_item_id` binary(16) NOT NULL,
    `task_id` binary(16) NOT NULL,
    FOREIGN KEY (`digital_item_id`) REFERENCES `digital_items` (`digital_item_id`) ON DELETE CASCADE,
    FOREIGN KEY (`task_id`) REFERENCES `tasks` (`task_id`) ON DELETE CASCADE
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

DROP TABLE
  IF EXISTS `database_tables`;

CREATE TABLE
  `database_tables` (
    `database_table_id` binary(16) DEFAULT (UUID_TO_BIN (UUID ())) COMMENT 'UUIDv1',
    `table_name` varchar(255) NOT NULL,
    `table_description` text,
    `user_id` binary(16) NOT NULL,
    `created_at` int (11) DEFAULT (UNIX_TIMESTAMP ()),
    `updated_at` int (11) DEFAULT (UNIX_TIMESTAMP ()),
    check (
      updated_at is null
      or updated_at >= created_at
    ),
    PRIMARY KEY (`database_table_id`),
    UNIQUE KEY `table_name` (`table_name`, `user_id`),
    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

DROP TABLE
  IF EXISTS `database_table_folders`;

CREATE TABLE
  `database_table_folders` (
    `database_table_id` binary(16) NOT NULL,
    `parent_folder_id` binary(16) NOT NULL,
    FOREIGN KEY (`parent_folder_id`) REFERENCES `folders` (`folder_id`) ON DELETE CASCADE,
    FOREIGN KEY (`database_table_id`) REFERENCES `database_tables` (`database_table_id`) ON DELETE CASCADE
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

DROP TABLE
  IF EXISTS `database_table_views`;

CREATE TABLE
  `database_table_views` (
    `view_id` binary(16) DEFAULT (UUID_TO_BIN (UUID ())) COMMENT 'UUIDv1',
    `view_name` varchar(30) NOT NULL,
    `view_description` text DEFAULT NULL,
    `table_name` varchar(255) NOT NULL,
    `table_state` json DEFAULT NULL,
    `user_id` binary(16) NOT NULL,
    `created_at` int (11) DEFAULT (UNIX_TIMESTAMP ()),
    `updated_at` int (11) DEFAULT (UNIX_TIMESTAMP ()),
    check (
      updated_at is null
      or updated_at >= created_at
    ),
    PRIMARY KEY (`view_id`),
    UNIQUE KEY `table_view` (`view_name`, `table_name`, `user_id`),
    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

SET
  FOREIGN_KEY_CHECKS = 1;
