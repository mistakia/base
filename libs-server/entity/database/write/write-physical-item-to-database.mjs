import debug from 'debug'
import db from '#db'
import { physical_item_constants } from '#libs-shared'
import { write_entity_to_database } from './write-entity-to-database.mjs'

const log = debug('entity:database:write-physical-item')

/**
 * Write a physical item entity to the database
 *
 * @param {Object} params Parameters
 * @param {Object} params.physical_item_properties Physical item properties object
 * @param {string} params.physical_item_properties.title Item name (required)
 * @param {string} [params.physical_item_properties.description=''] Item description
 * @param {string} [params.physical_item_properties.permalink=null] Custom URL path (auto-generated if omitted)
 * @param {Object} [params.physical_item_properties.relations={}] Relations object with relation types as keys and arrays of target IDs as values
 * @param {string[]} [params.physical_item_properties.tags=[]] Tags to associate with the item
 * @param {string[]} [params.physical_item_properties.observations=[]] Array of structured observations
 * @param {string} [params.physical_item_properties.manufacturer=null] Manufacturer of the item
 * @param {string} [params.physical_item_properties.model_number=null] Model number or identifier
 * @param {string} [params.physical_item_properties.serial_number=null] Unique serial number
 * @param {string} [params.physical_item_properties.storage_location=null] Where the item is stored
 * @param {Date} [params.physical_item_properties.acquisition_date=null] When the item was acquired
 * @param {string} [params.physical_item_properties.target_location=null] Where the item should be stored
 * @param {string} [params.physical_item_properties.current_location=null] Where the item currently is
 * @param {string[]} [params.physical_item_properties.home_areas=null] Areas where this item belongs
 * @param {string[]} [params.physical_item_properties.home_attribute=null] Attributes of ideal storage location
 * @param {string[]} [params.physical_item_properties.activities=null] Activities this item is used for
 * @param {string} [params.physical_item_properties.importance=null] Importance classification (Core, Standard, Premium, Potential)
 * @param {string} [params.physical_item_properties.frequency_of_use=null] How often the item is used (Daily, Weekly, Infrequent)
 * @param {number} [params.physical_item_properties.height_inches=null] Height in inches
 * @param {number} [params.physical_item_properties.width_inches=null] Width in inches
 * @param {number} [params.physical_item_properties.depth_inches=null] Depth in inches
 * @param {number} [params.physical_item_properties.weight_ounces=null] Weight in ounces
 * @param {number} [params.physical_item_properties.volume_cubic_inches=null] Volume in cubic inches
 * @param {string} [params.physical_item_properties.voltage=null] Voltage requirements
 * @param {number} [params.physical_item_properties.wattage=null] Wattage consumption
 * @param {number} [params.physical_item_properties.outlets_used=null] Number of electrical outlets used
 * @param {boolean} [params.physical_item_properties.water_connection=null] Requires water connection
 * @param {boolean} [params.physical_item_properties.drain_connection=null] Requires drain connection
 * @param {boolean} [params.physical_item_properties.ethernet_connected=null] Requires ethernet connection
 * @param {number} [params.physical_item_properties.min_storage_temperature_celsius=null] Minimum storage temperature
 * @param {number} [params.physical_item_properties.max_storage_temperature_celsius=null] Maximum storage temperature
 * @param {number} [params.physical_item_properties.min_storage_humidity_percent=null] Minimum storage humidity
 * @param {number} [params.physical_item_properties.max_storage_humidity_percent=null] Maximum storage humidity
 * @param {boolean} [params.physical_item_properties.exist=null] Whether the item exists or is planned
 * @param {number} [params.physical_item_properties.current_quantity=null] Quantity currently in possession
 * @param {number} [params.physical_item_properties.target_quantity=null] Desired quantity
 * @param {string} [params.physical_item_properties.consumable=null] Whether the item is depleted with use
 * @param {boolean} [params.physical_item_properties.perishable=null] Whether the item expires
 * @param {string} [params.physical_item_properties.kit_name=null] Name of kit this item belongs to
 * @param {string[]} [params.physical_item_properties.kit_items=null] Items in this kit
 * @param {number} [params.physical_item_properties.large_drawer_units=null] Large drawer units required
 * @param {number} [params.physical_item_properties.standard_drawer_units=null] Standard drawer units required
 * @param {string} [params.physical_item_properties.storage_notes=null] Notes about storing this item
 * @param {string} [params.physical_item_properties.misc_notes=null] Miscellaneous notes
 * @param {Date} [params.physical_item_properties.created_at] Creation timestamp (auto-generated if omitted)
 * @param {Date} [params.physical_item_properties.updated_at] Last modified timestamp (auto-generated if omitted)
 * @param {Date} [params.physical_item_properties.archived_at=null] Date when the item was archived
 * @param {string} params.user_id User ID who owns the item entity
 * @param {string} [params.physical_item_content=''] Optional item content/markdown
 * @param {string} [params.entity_id=null] Optional entity ID for updates
 * @param {string} params.absolute_path Absolute path to the file
 * @param {string} params.base_relative_path Base relative path to the file
 * @param {string} params.git_sha Git SHA of the file
 * @param {Object} [params.trx=null] Optional transaction object
 * @param {string} [params.root_base_directory=null] Root base directory of the repository
 * @param {Object} params.formatted_entity_metadata Formatted entity metadata
 * @returns {Promise<string>} The entity_id
 */
export async function write_physical_item_to_database({
  physical_item_properties,
  user_id,
  physical_item_content = '',
  entity_id = null,
  absolute_path,
  base_relative_path,
  git_sha,
  trx = null,
  root_base_directory,
  formatted_entity_metadata
}) {
  try {
    log('Writing physical item to database')
    const db_client = trx || db

    // Validate importance and frequency values if provided
    if (physical_item_properties.importance) {
      const valid_importance = Object.values(
        physical_item_constants.IMPORTANCE_TYPES
      )
      if (!valid_importance.includes(physical_item_properties.importance)) {
        log(
          `Warning: Invalid importance value: ${physical_item_properties.importance}. Valid values are: ${valid_importance.join(', ')}`
        )
      }
    }

    if (physical_item_properties.frequency_of_use) {
      const valid_frequency = Object.values(
        physical_item_constants.FREQUENCY_TYPES
      )
      if (
        !valid_frequency.includes(physical_item_properties.frequency_of_use)
      ) {
        log(
          `Warning: Invalid frequency_of_use value: ${physical_item_properties.frequency_of_use}. Valid values are: ${valid_frequency.join(', ')}`
        )
      }
    }

    // First write the base entity
    const result_entity_id = await write_entity_to_database({
      entity_properties: physical_item_properties,
      entity_type: 'physical_item',
      user_id,
      entity_content: physical_item_content,
      entity_id,
      absolute_path,
      base_relative_path,
      git_sha,
      trx: db_client,
      root_base_directory,
      formatted_entity_metadata
    })

    // Process physical item-specific data
    await write_physical_item_data_to_database({
      entity_id: result_entity_id,
      serial_number: physical_item_properties.serial_number,
      model_number: physical_item_properties.model_number,
      manufacturer: physical_item_properties.manufacturer,
      storage_location: physical_item_properties.storage_location,
      acquisition_date: physical_item_properties.acquisition_date,
      target_location: physical_item_properties.target_location,
      current_location: physical_item_properties.current_location,
      home_areas: physical_item_properties.home_areas,
      home_attribute: physical_item_properties.home_attribute,
      activities: physical_item_properties.activities,
      importance: physical_item_properties.importance,
      frequency_of_use: physical_item_properties.frequency_of_use,
      height_inches: physical_item_properties.height_inches,
      width_inches: physical_item_properties.width_inches,
      depth_inches: physical_item_properties.depth_inches,
      weight_ounces: physical_item_properties.weight_ounces,
      volume_cubic_inches: physical_item_properties.volume_cubic_inches,
      voltage: physical_item_properties.voltage,
      wattage: physical_item_properties.wattage,
      outlets_used: physical_item_properties.outlets_used,
      water_connection: physical_item_properties.water_connection,
      drain_connection: physical_item_properties.drain_connection,
      ethernet_connected: physical_item_properties.ethernet_connected,
      min_storage_temperature_celsius:
        physical_item_properties.min_storage_temperature_celsius,
      max_storage_temperature_celsius:
        physical_item_properties.max_storage_temperature_celsius,
      min_storage_humidity_percent:
        physical_item_properties.min_storage_humidity_percent,
      max_storage_humidity_percent:
        physical_item_properties.max_storage_humidity_percent,
      exist: physical_item_properties.exist,
      current_quantity: physical_item_properties.current_quantity,
      target_quantity: physical_item_properties.target_quantity,
      consumable: physical_item_properties.consumable,
      perishable: physical_item_properties.perishable,
      kit_name: physical_item_properties.kit_name,
      kit_items: physical_item_properties.kit_items,
      large_drawer_units: physical_item_properties.large_drawer_units,
      standard_drawer_units: physical_item_properties.standard_drawer_units,
      storage_notes: physical_item_properties.storage_notes,
      misc_notes: physical_item_properties.misc_notes,
      db_client
    })

    log(`Physical item successfully written with ID: ${result_entity_id}`)
    return result_entity_id
  } catch (error) {
    log('Error writing physical item to database:', error)
    throw error
  }
}

/**
 * Write physical item-specific data to the database
 *
 * @param {Object} params Parameters
 * @param {string} params.entity_id Entity ID
 * @param {string} [params.serial_number=null] Unique serial number
 * @param {string} [params.model_number=null] Model number or identifier
 * @param {string} [params.manufacturer=null] Manufacturer of the item
 * @param {string} [params.storage_location=null] Where the item is stored
 * @param {Date} [params.acquisition_date=null] When the item was acquired
 * @param {string} [params.target_location=null] Where the item should be stored
 * @param {string} [params.current_location=null] Where the item currently is
 * @param {string[]} [params.home_areas=null] Areas where this item belongs
 * @param {string[]} [params.home_attribute=null] Attributes of ideal storage location
 * @param {string[]} [params.activities=null] Activities this item is used for
 * @param {string} [params.importance=null] Importance classification
 * @param {string} [params.frequency_of_use=null] How often the item is used
 * @param {number} [params.height_inches=null] Height in inches
 * @param {number} [params.width_inches=null] Width in inches
 * @param {number} [params.depth_inches=null] Depth in inches
 * @param {number} [params.weight_ounces=null] Weight in ounces
 * @param {number} [params.volume_cubic_inches=null] Volume in cubic inches
 * @param {string} [params.voltage=null] Voltage requirements
 * @param {number} [params.wattage=null] Wattage consumption
 * @param {number} [params.outlets_used=null] Number of electrical outlets used
 * @param {boolean} [params.water_connection=null] Requires water connection
 * @param {boolean} [params.drain_connection=null] Requires drain connection
 * @param {boolean} [params.ethernet_connected=null] Requires ethernet connection
 * @param {number} [params.min_storage_temperature_celsius=null] Minimum storage temperature
 * @param {number} [params.max_storage_temperature_celsius=null] Maximum storage temperature
 * @param {number} [params.min_storage_humidity_percent=null] Minimum storage humidity
 * @param {number} [params.max_storage_humidity_percent=null] Maximum storage humidity
 * @param {boolean} [params.exist=null] Whether the item exists or is planned
 * @param {number} [params.current_quantity=null] Quantity currently in possession
 * @param {number} [params.target_quantity=null] Desired quantity
 * @param {boolean} [params.consumable=null] Whether the item is depleted with use
 * @param {boolean} [params.perishable=null] Whether the item expires
 * @param {string} [params.kit_name=null] Name of kit this item belongs to
 * @param {string[]} [params.kit_items=null] Items in this kit
 * @param {number} [params.large_drawer_units=null] Large drawer units required
 * @param {number} [params.standard_drawer_units=null] Standard drawer units required
 * @param {string} [params.storage_notes=null] Notes about storing this item
 * @param {string} [params.misc_notes=null] Miscellaneous notes
 * @param {Object} params.db_client Database client
 * @returns {Promise<void>}
 */
async function write_physical_item_data_to_database({
  entity_id,
  serial_number = null,
  model_number = null,
  manufacturer = null,
  storage_location = null,
  acquisition_date = null,
  target_location = null,
  current_location = null,
  home_areas = null,
  home_attribute = null,
  activities = null,
  importance = null,
  frequency_of_use = null,
  height_inches = null,
  width_inches = null,
  depth_inches = null,
  weight_ounces = null,
  volume_cubic_inches = null,
  voltage = null,
  wattage = null,
  outlets_used = null,
  water_connection = null,
  drain_connection = null,
  ethernet_connected = null,
  min_storage_temperature_celsius = null,
  max_storage_temperature_celsius = null,
  min_storage_humidity_percent = null,
  max_storage_humidity_percent = null,
  exist = null,
  current_quantity = null,
  target_quantity = null,
  consumable = null,
  perishable = null,
  kit_name = null,
  kit_items = null,
  large_drawer_units = null,
  standard_drawer_units = null,
  storage_notes = null,
  misc_notes = null,
  db_client
}) {
  log(`Writing physical item data for entity: ${entity_id}`)

  // Process physical item-specific data
  const physical_item_data = {
    entity_id,
    serial_number,
    model_number,
    manufacturer,
    storage_location,
    acquisition_date,
    target_location,
    current_location,
    home_areas,
    home_attribute,
    activities,
    importance,
    frequency_of_use,
    height_inches,
    width_inches,
    depth_inches,
    weight_ounces,
    volume_cubic_inches,
    voltage,
    wattage,
    outlets_used,
    water_connection,
    drain_connection,
    ethernet_connected,
    min_storage_temperature_celsius,
    max_storage_temperature_celsius,
    min_storage_humidity_percent,
    max_storage_humidity_percent,
    exist,
    current_quantity,
    target_quantity,
    consumable,
    perishable,
    kit_name,
    kit_items,
    large_drawer_units,
    standard_drawer_units,
    storage_notes,
    misc_notes
  }

  // Upsert physical item data
  await db_client('physical_items')
    .insert(physical_item_data)
    .onConflict('entity_id')
    .merge()

  log(`Physical item data written successfully for entity: ${entity_id}`)
}

export default write_physical_item_to_database
