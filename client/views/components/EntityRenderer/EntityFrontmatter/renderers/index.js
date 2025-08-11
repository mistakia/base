import { DateField } from './date-field.js'
import { TagsField } from './tags-field.js'
import { RelationsField } from './relations-field.js'
import { DefaultField } from './default-field.js'
import { BooleanField } from './boolean-field.js'
import { ListField } from './list-field.js'

const date_keys = new Set([
  'created_at',
  'updated_at',
  'start_by',
  'finish_by',
  'planned_start',
  'planned_finish',
  'started_at',
  'finished_at',
  'snooze_until',
  'archived_at'
])

const boolean_keys = new Set([
  'exist',
  'water_connection',
  'drain_connection',
  'ethernet_connected',
  'consumable',
  'perishable'
])

const list_join_keys = new Set(['home_areas', 'home_attribute', 'kit_items'])

export const resolve_renderer = ({ key_name }) => {
  if (key_name === 'tags') return TagsField
  if (key_name === 'relations') return RelationsField
  if (date_keys.has(key_name)) return DateField
  if (boolean_keys.has(key_name)) return BooleanField
  if (list_join_keys.has(key_name)) return ListField
  return DefaultField
}
