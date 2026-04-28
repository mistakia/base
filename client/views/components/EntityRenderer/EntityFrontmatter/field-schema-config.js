/**
 * Schema-driven field type and options configuration for editable fields.
 * Maps entity_type -> field_name -> { type, options? }
 */
export const entity_field_schema = {
  physical_item: {
    importance: {
      type: 'select',
      options: ['Core', 'Standard', 'Premium', 'Potential']
    },
    frequency_of_use: {
      type: 'select',
      options: ['Daily', 'Weekly', 'Infrequent']
    },
    exist: { type: 'boolean' },
    consumable: { type: 'boolean' },
    perishable: { type: 'boolean' },
    water_connection: { type: 'boolean' },
    drain_connection: { type: 'boolean' },
    ethernet_connected: { type: 'boolean' },
    current_quantity: { type: 'number' },
    target_quantity: { type: 'number' },
    height_inches: { type: 'number' },
    width_inches: { type: 'number' },
    depth_inches: { type: 'number' },
    weight_ounces: { type: 'number' },
    weight_oz: { type: 'number' },
    volume_cubic_inches: { type: 'number' },
    liquid_volume_oz: { type: 'number' },
    solids_volume_oz: { type: 'number' },
    voltage: { type: 'number' },
    wattage: { type: 'number' },
    outlets_used: { type: 'number' },
    large_drawer_units: { type: 'number' },
    standard_drawer_units: { type: 'number' },
    min_storage_temperature_celsius: { type: 'number' },
    max_storage_temperature_celsius: { type: 'number' },
    min_storage_humidity_percent: { type: 'number' },
    max_storage_humidity_percent: { type: 'number' },
    manufacturer: { type: 'string' },
    model_number: { type: 'string' },
    serial_number: { type: 'string' },
    current_location: { type: 'string' },
    storage_location: { type: 'string' },
    target_location: { type: 'string' },
    storage_area: { type: 'string' },
    kit_name: { type: 'string' },
    storage_notes: { type: 'text' },
    amazon_order_id: { type: 'string' },
    amazon_asin: { type: 'string' }
  }
}
