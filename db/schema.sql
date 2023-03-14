CREATE TABLE
  `users` (
    `id` binary(16) DEFAULT (UUID_TO_BIN (UUID ())) comment 'UUIDv1',
    `public_key` varchar(32) DEFAULT NOT NULL comment 'public key of user (32 hex characters)',
    `username` varchar(255) DEFAULT NOT NULL,
    `email` varchar(255) DEFAULT NULL,
    `created_at` int (11) DEFAULT NULL,
    `updated_at` int (11) DEFAULT NULL,
    check (
      updated_at is null
      or updated_at >= created_at
    ),
    PRIMARY KEY (`id`),
    UNIQUE KEY `public_key` (`public_key`),
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

CREATE TABLE
  `folders` (
    `path` varchar(255) DEFAULT NOT NULL comment 'format: /<user_id>/folders/<folder1>/<folder2>/<folder3>',
    `name` varchar(255) DEFAULT NOT NULL,
    `description` text DEFAULT NULL,
    `created_at` int (11) DEFAULT NULL,
    `updated_at` int (11) DEFAULT NULL,
    `archived_at` int (11) DEFAULT NULL,
    check (
      updated_at is null
      or updated_at >= created_at
    ),
    check (
      archived_at is null
      or archived_at >= updated_at
    ),
    PRIMARY KEY (`path`),
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

CREATE TABLE
  `tasks` (
    `id` binary(16) DEFAULT (UUID_TO_BIN (UUID ())) comment 'UUIDv1',
    `text_input` text DEFAULT NOT NULL comment 'user text input',
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
    ) comment 'status of task',
    `finish_by` int (11) DEFAULT NULL,
    `estimated_total_duration` int (11) DEFAULT NULL,
    `estimated_preparation_duration` int (11) DEFAULT NULL,
    `estimated_execution_duration` int (11) DEFAULT NULL,
    `estimated_cleanup_duration` int (11) DEFAULT NULL,
    `actual_duration` int (11) unsigned DEFAULT NULL,
    `planned_start` int (11) DEFAULT NULL,
    `planned_finish` int (11) DEFAULT NULL,
    `started_at` int (11) DEFAULT NULL,
    `finished_at` int (11) DEFAULT NULL,
    `created_at` int (11) DEFAULT NULL,
    `updated_at` int (11) DEFAULT NULL,
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
      finish_by is null
      or finish_by >= created_at
    ),
    PRIMARY KEY (`id`),
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

CREATE TABLE
  `tasks_folders` (
    `task_id` binary(16) DEFAULT NOT NULL,
    `folder_path` varchar(255) DEFAULT NOT NULL,
    FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`),
    FOREIGN KEY (`folder_path`) REFERENCES `folders` (`path`),
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

CREATE TABLE
  `task_child_tasks` (
    `parent_task_id` binary(16) DEFAULT NOT NULL,
    `child_task_id` binary(16) DEFAULT NOT NULL,
    FOREIGN KEY (`parent_task_id`) REFERENCES `tasks` (`id`),
    FOREIGN KEY (`child_task_id`) REFERENCES `tasks` (`id`),
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

CREATE TABLE
  `task_dependent_tasks` (
    `task_id` binary(16) DEFAULT NOT NULL,
    `dependent_task_id` binary(16) DEFAULT NOT NULL,
    FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`),
    FOREIGN KEY (`dependent_task_id`) REFERENCES `tasks` (`id`),
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

CREATE TABLE
  `activities` (
    `id` binary(16) DEFAULT (UUID_TO_BIN (UUID ())) comment 'UUIDv1',
    `name` varchar(255) DEFAULT NOT NULL,
    `description` text DEFAULT NULL,
    `created_at` int (11) DEFAULT NULL,
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

CREATE TABLE
  `activities_tasks` (
    `activity_id` binary(16) DEFAULT NOT NULL,
    `task_id` binary(16) DEFAULT NOT NULL,
    FOREIGN KEY (`activity_id`) REFERENCES `activities` (`id`),
    FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`),
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

CREATE TABLE
  `organizations` (
    `id` binary(16) DEFAULT (UUID_TO_BIN (UUID ())) comment 'UUIDv1',
    `name` varchar(255) DEFAULT NOT NULL,
    `website_url` varchar(255) DEFAULT NULL,
    `description` text DEFAULT NULL,
    `created_at` int (11) DEFAULT NULL,
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

CREATE TABLE
  `persons` (
    `id` binary(16) DEFAULT (UUID_TO_BIN (UUID ())) comment 'UUIDv1',
    `first_name` varchar(255) DEFAULT NOT NULL,
    `last_name` varchar(255) DEFAULT NOT NULL,
    `email` varchar(255) DEFAULT NULL,
    `mobile_phone` varchar(255) DEFAULT NULL,
    `website_url` varchar(255) DEFAULT NULL,
    `created_at` int (11) DEFAULT NULL,
    PRIMARY KEY (`id`),
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

CREATE TABLE
  `persons_organizations` (
    `person_id` binary(16) DEFAULT NOT NULL,
    `organization_id` binary(16) DEFAULT NOT NULL,
    FOREIGN KEY (`person_id`) REFERENCES `persons` (`id`),
    FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`),
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

CREATE TABLE
  `persons_tasks` (
    `person_id` binary(16) DEFAULT NOT NULL,
    `task_id` binary(16) DEFAULT NOT NULL,
    FOREIGN KEY (`person_id`) REFERENCES `persons` (`id`),
    FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`),
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

CREATE TABLE
  `physical_items` (
    `id` binary(16) DEFAULT (UUID_TO_BIN (UUID ())) comment 'UUIDv1',
    `name` varchar(255) DEFAULT NOT NULL,
    `description` text DEFAULT NULL,
    `created_at` int (11) DEFAULT NULL,
    `updated_at` int (11) DEFAULT NULL,
    `location_id` varchar(100) DEFAULT NULL,
    `serial_number` varchar(255) DEFAULT NULL,
    `model_number` varchar(255) DEFAULT NULL,
    `manufacturer` varchar(255) DEFAULT NULL,
    `storage_location` varchar(255) DEFAULT NULL,
    check (
      updated_at is null
      or updated_at >= created_at
    ),
    FOREIGN KEY (`location_id`) REFERENCES `physical_locations` (`id`),
    PRIMARY KEY (`id`),
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

CREATE TABLE
  `physical_items_child_items` (
    `parent_item_id` binary(16) DEFAULT NOT NULL,
    `child_item_id` binary(16) DEFAULT NOT NULL,
    FOREIGN KEY (`parent_item_id`) REFERENCES `physical_items` (`id`),
    FOREIGN KEY (`child_item_id`) REFERENCES `physical_items` (`id`),
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

CREATE TABLE
  `physical_items_folders` (
    `physical_item_id` varchar(100) DEFAULT NOT NULL,
    `folder_path` varchar(255) DEFAULT NOT NULL,
    FOREIGN KEY (`physical_item_id`) REFERENCES `physical_items` (`id`),
    FOREIGN KEY (`folder_path`) REFERENCES `folders` (`path`),
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

CREATE TABLE
  `physical_items_tasks` (
    `physical_item_id` varchar(100) DEFAULT NOT NULL,
    `task_id` varchar(100) DEFAULT NOT NULL,
    FOREIGN KEY (`physical_item_id`) REFERENCES `physical_items` (`id`),
    FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`),
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

CREATE TABLE
  `physical_locations` (
    `id` binary(16) DEFAULT NOT NULL comment 'format: xxhash(`/latitude/longitude`)',
    `latitude` DECIMAL(10, 8) comment 'latitude decimal coordinate',
    `longitude` DECIMAL(11, 8) comment 'longitude decimal coordinate',
    `name` varchar(255),
    `mail_address` text comment 'Mailing Address',
    `mail_address2` text comment 'Mailing Address Second Line',
    `mail_careof` text comment 'Mailing Address Care of',
    `mail_street_number` text comment 'Mailing Address Street Number',
    `mail_street_prefix` text comment 'Mailing Address Street Prefix',
    `mail_street_name` text comment 'Mailing Address Street Name',
    `mail_street_type` text comment 'Mailing Address Street Type',
    `mail_street_suffix` text comment 'Mailing Address Street Suffix',
    `mail_unit_number` text comment 'Mailing Address Unit Number',
    `mail_city` text comment 'Mailing Address City',
    `mail_state2` text comment 'Mailing Address State',
    `mail_zip` text comment 'Mailing Address ZIP Code',
    `mail_country` text comment 'Mailing Address Country',
    `mail_urbanization` text comment 'Mailing Address Urbanizacion (Puerto Rico)',
    PRIMARY KEY (`id`),
    KEY `index_lat_lon` (`latitude`, `longitude`)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

CREATE TABLE
  `digital_items` (
    `ipfs_hash` varchar(100) NOT NULL comment 'used as id',
    /* TODO figure out length */
    `text` text DEFAULT NULL,
    `markdown` text DEFAULT NULL,
    `html` text DEFAULT NULL,
    `href` varchar(255) DEFAULT NULL,
    `created_at` int (11) DEFAULT NULL,
    PRIMARY KEY (`ipfs_hash`),
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

CREATE TABLE
  `digital_items_folders` (
    `ipfs_hash` varchar(100) DEFAULT NOT NULL,
    `folder_path` varchar(255) DEFAULT NOT NULL,
    FOREIGN KEY (`ipfs_hash`) REFERENCES `digital_items` (`ipfs_hash`),
    FOREIGN KEY (`folder_path`) REFERENCES `folders` (`path`),
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;

CREATE TABLE
  `digital_items_tasks` (
    `ipfs_hash` varchar(100) DEFAULT NOT NULL,
    `task_id` varchar(100) DEFAULT NOT NULL,
    FOREIGN KEY (`ipfs_hash`) REFERENCES `digital_items` (`ipfs_hash`),
    FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`),
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8;
