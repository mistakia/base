export const entity_field_config = {
  task: {
    always_visible: [
      'status',
      'priority',
      'tags',
      'start_by',
      'finish_by',
      'assigned_to',
      'created_at',
      'updated_at'
    ],
    expandable: [
      'entity_id',
      'user_public_key',
      'base_uri',
      'permalink',
      'external_id',
      'external_url',
      'github_url',
      'github_api_id',
      'github_graphql_id',
      'github_project_item_id',
      'github_project_number',
      'github_number',
      'github_repository_name',
      'github_repository_owner',
      'github_comments',
      'import_cid',
      'reference_url',
      'public_read',
      'estimated_total_duration',
      'estimated_preparation_duration',
      'estimated_execution_duration',
      'estimated_cleanup_duration',
      'estimated_hours',
      'actual_duration',
      'planned_start',
      'planned_finish',
      'started_at',
      'finished_at',
      'completed_at',
      'snooze_until',
      'archived_at'
    ]
  },
  workflow: {
    always_visible: ['status', 'tags', 'tools', 'created_at', 'updated_at'],
    expandable: [
      'entity_id',
      'user_public_key',
      'base_uri',
      'permalink',
      'prompt_properties',
      'public_read',
      'archived_at'
    ]
  },
  guideline: {
    always_visible: ['tags', 'globs', 'created_at', 'updated_at'],
    expandable: [
      'entity_id',
      'user_public_key',
      'base_uri',
      'permalink',
      'public_read',
      'archived_at'
    ]
  },
  tag: {
    always_visible: ['created_at', 'updated_at'],
    expandable: [
      'entity_id',
      'user_public_key',
      'base_uri',
      'permalink',
      'color',
      'icon',
      'public_read',
      'archived_at'
    ]
  },
  physical_item: {
    // Show all set fields by default; on expand show all schema fields even if empty
    show_set_by_default: true,
    always_visible: ['created_at', 'updated_at'],
    expandable: [
      'entity_id',
      'user_public_key',
      'base_uri',
      'permalink',
      'public_read',
      'archived_at'
    ],
    // All domain fields - shown if set by default, shown empty on expand
    // Ordered by: classification, inventory, identity, location, physical,
    // infrastructure, storage/org, notes, import
    schema_fields: [
      'tags',
      'importance',
      'frequency_of_use',
      'exist',
      'consumable',
      'perishable',
      'current_quantity',
      'target_quantity',
      'manufacturer',
      'model_number',
      'serial_number',
      'kit_name',
      'kit_items',
      'acquisition_date',
      'current_location',
      'storage_location',
      'target_location',
      'storage_area',
      'home_areas',
      'home_attribute',
      'height_inches',
      'width_inches',
      'depth_inches',
      'weight_ounces',
      'weight_oz',
      'volume_cubic_inches',
      'liquid_volume_oz',
      'solids_volume_oz',
      'voltage',
      'wattage',
      'outlets_used',
      'water_connection',
      'drain_connection',
      'ethernet_connected',
      'min_storage_temperature_celsius',
      'max_storage_temperature_celsius',
      'min_storage_humidity_percent',
      'max_storage_humidity_percent',
      'large_drawer_units',
      'standard_drawer_units',
      'storage_notes',
      'amazon_order_id',
      'amazon_asin',
      'external_id',
      'import_cid'
    ]
  },
  physical_location: {
    always_visible: [
      'tags',
      'mail_address',
      'mail_city',
      'mail_state',
      'mail_zip',
      'created_at',
      'updated_at'
    ],
    expandable: [
      'entity_id',
      'user_public_key',
      'base_uri',
      'permalink',
      'mail_street_number',
      'mail_street_name',
      'mail_street_type',
      'mail_street_suffix',
      'mail_unit_number',
      'mail_country',
      'public_read',
      'archived_at'
    ]
  },
  type_definition: {
    always_visible: [
      'type_name',
      'extends',
      'properties',
      'tags',
      'created_at',
      'updated_at'
    ],
    expandable: [
      'entity_id',
      'user_public_key',
      'base_uri',
      'permalink',
      'public_read',
      'archived_at'
    ]
  },
  'scheduled-command': {
    always_visible: [
      'command',
      'schedule_type',
      'schedule',
      'enabled',
      'timezone',
      'tags',
      'created_at',
      'updated_at'
    ],
    expandable: [
      'entity_id',
      'user_public_key',
      'base_uri',
      'permalink',
      'working_directory',
      'execution_mode',
      'queue_tags',
      'queue_priority',
      'timeout_ms',
      'run_on_machines',
      'job_id',
      'last_triggered_at',
      'next_trigger_at',
      'public_read',
      'archived_at'
    ]
  },
  database: {
    always_visible: [
      'table_name',
      'fields',
      'storage_config',
      'tags',
      'created_at',
      'updated_at'
    ],
    expandable: [
      'entity_id',
      'user_public_key',
      'base_uri',
      'permalink',
      'table_description',
      'import_cli',
      'import_schedule',
      'views',
      'public_read',
      'archived_at'
    ]
  },
  database_item: {
    always_visible: ['database_table_id', 'tags', 'created_at', 'updated_at'],
    expandable: [
      'entity_id',
      'user_public_key',
      'base_uri',
      'permalink',
      'public_read',
      'archived_at'
    ]
  },
  database_view: {
    always_visible: [
      'view_name',
      'table_name',
      'tags',
      'created_at',
      'updated_at'
    ],
    expandable: [
      'entity_id',
      'user_public_key',
      'base_uri',
      'permalink',
      'view_description',
      'table_state',
      'public_read',
      'archived_at'
    ]
  },
  person: {
    always_visible: [
      'first_name',
      'last_name',
      'alias',
      'email',
      'tags',
      'created_at',
      'updated_at'
    ],
    expandable: [
      'entity_id',
      'user_public_key',
      'base_uri',
      'permalink',
      'mobile_phone',
      'website_url',
      'public_read',
      'archived_at'
    ]
  },
  organization: {
    always_visible: ['website_url', 'tags', 'created_at', 'updated_at'],
    expandable: [
      'entity_id',
      'user_public_key',
      'base_uri',
      'permalink',
      'public_read',
      'archived_at'
    ]
  },
  identity: {
    always_visible: [
      'username',
      'permissions',
      'tags',
      'created_at',
      'updated_at'
    ],
    expandable: [
      'entity_id',
      'user_public_key',
      'base_uri',
      'permalink',
      'auth_public_key',
      'thread_config',
      'rules',
      'public_read',
      'archived_at'
    ]
  },
  role: {
    always_visible: ['rules', 'tags', 'created_at', 'updated_at'],
    expandable: [
      'entity_id',
      'user_public_key',
      'base_uri',
      'permalink',
      'public_read',
      'archived_at'
    ]
  },
  digital_item: {
    always_visible: [
      'file_mime_type',
      'file_uri',
      'file_size',
      'tags',
      'created_at',
      'updated_at'
    ],
    expandable: [
      'entity_id',
      'user_public_key',
      'base_uri',
      'permalink',
      'file_cid',
      'text',
      'html',
      'public_read',
      'archived_at'
    ]
  },
  extension: {
    always_visible: [
      'requires',
      'optional',
      'tags',
      'created_at',
      'updated_at'
    ],
    expandable: [
      'entity_id',
      'user_public_key',
      'base_uri',
      'permalink',
      'public_read',
      'archived_at'
    ]
  },
  skill: {
    always_visible: ['extension', 'tags', 'created_at', 'updated_at'],
    expandable: [
      'entity_id',
      'user_public_key',
      'base_uri',
      'permalink',
      'public_read',
      'archived_at'
    ]
  },
  default: {
    always_visible: ['status', 'priority', 'tags', 'created_at', 'updated_at'],
    expandable: [
      'entity_id',
      'user_public_key',
      'base_uri',
      'permalink',
      'start_by',
      'finish_by',
      'globs',
      'tools',
      'prompt_properties',
      'reference_url',
      'public_read',
      'estimated_total_duration',
      'estimated_preparation_duration',
      'estimated_execution_duration',
      'estimated_cleanup_duration',
      'actual_duration',
      'planned_start',
      'planned_finish',
      'started_at',
      'finished_at',
      'completed_at',
      'snooze_until',
      'assigned_to',
      'archived_at'
    ]
  }
}
