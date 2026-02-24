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
    always_visible: [
      'tags',
      'manufacturer',
      'model_number',
      'current_location',
      'storage_location',
      'current_quantity',
      'importance',
      'frequency_of_use',
      'created_at',
      'updated_at'
    ],
    expandable: [
      'entity_id',
      'user_public_key',
      'base_uri',
      'permalink',
      'external_id',
      'import_cid',
      'serial_number',
      'acquisition_date',
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
      'exist',
      'target_quantity',
      'consumable',
      'perishable',
      'kit_name',
      'kit_items',
      'large_drawer_units',
      'standard_drawer_units',
      'storage_notes',
      'misc_notes',
      'public_read',
      'archived_at'
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
