import {
  TABLE_DATA_TYPES,
  TABLE_OPERATORS
} from 'react-table/src/constants.mjs'
import { format_shorthand_time } from '@views/utils/date-formatting.js'
import TitleCell from '../primitives/cells/TitleCell.js'
import TagsCell from '../primitives/cells/TagsCell.js'

export const physical_item_columns = {
  title: {
    column_id: 'title',
    header_label: 'Title',
    accessorKey: 'title',
    component: TitleCell,
    data_type: TABLE_DATA_TYPES.TEXT,
    operators: [
      TABLE_OPERATORS.LIKE,
      TABLE_OPERATORS.NOT_LIKE,
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL,
      TABLE_OPERATORS.IS_EMPTY,
      TABLE_OPERATORS.IS_NOT_EMPTY
    ],
    size: 600,
    minSize: 200,
    maxSize: 900
  },
  description: {
    column_id: 'description',
    header_label: 'Description',
    accessorKey: 'description',
    data_type: TABLE_DATA_TYPES.TEXT,
    operators: [TABLE_OPERATORS.LIKE, TABLE_OPERATORS.NOT_LIKE],
    size: 300,
    minSize: 150,
    maxSize: 500
  },
  category: {
    column_id: 'category',
    header_label: 'Category',
    accessorKey: 'category',
    data_type: TABLE_DATA_TYPES.TEXT,
    operators: [
      TABLE_OPERATORS.IN,
      TABLE_OPERATORS.NOT_IN,
      TABLE_OPERATORS.LIKE,
      TABLE_OPERATORS.NOT_LIKE
    ],
    size: 180,
    minSize: 100,
    maxSize: 250
  },
  importance: {
    column_id: 'importance',
    header_label: 'Importance',
    accessorKey: 'importance',
    data_type: TABLE_DATA_TYPES.SELECT,
    operators: [
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL,
      TABLE_OPERATORS.IN,
      TABLE_OPERATORS.NOT_IN
    ],
    column_values: ['Core', 'Standard', 'Premium', 'Potential'],
    size: 130,
    minSize: 80,
    maxSize: 180
  },
  frequency_of_use: {
    column_id: 'frequency_of_use',
    header_label: 'Frequency',
    accessorKey: 'frequency_of_use',
    data_type: TABLE_DATA_TYPES.SELECT,
    operators: [
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL,
      TABLE_OPERATORS.IN,
      TABLE_OPERATORS.NOT_IN
    ],
    column_values: ['Daily', 'Weekly', 'Infrequent'],
    size: 120,
    minSize: 80,
    maxSize: 160
  },
  exist: {
    column_id: 'exist',
    header_label: 'Exists',
    accessorKey: 'exist',
    accessorFn: ({ exist }) => {
      if (exist === true) return 'Yes'
      if (exist === false) return 'No'
      return '—'
    },
    data_type: TABLE_DATA_TYPES.BOOLEAN,
    operators: [TABLE_OPERATORS.EQUAL, TABLE_OPERATORS.NOT_EQUAL],
    size: 80,
    minSize: 60,
    maxSize: 100
  },
  consumable: {
    column_id: 'consumable',
    header_label: 'Consumable',
    accessorKey: 'consumable',
    accessorFn: ({ consumable }) => {
      if (consumable === true) return 'Yes'
      if (consumable === false) return 'No'
      return '—'
    },
    data_type: TABLE_DATA_TYPES.BOOLEAN,
    operators: [TABLE_OPERATORS.EQUAL, TABLE_OPERATORS.NOT_EQUAL],
    size: 110,
    minSize: 80,
    maxSize: 140
  },
  perishable: {
    column_id: 'perishable',
    header_label: 'Perishable',
    accessorKey: 'perishable',
    accessorFn: ({ perishable }) => {
      if (perishable === true) return 'Yes'
      if (perishable === false) return 'No'
      return '—'
    },
    data_type: TABLE_DATA_TYPES.BOOLEAN,
    operators: [TABLE_OPERATORS.EQUAL, TABLE_OPERATORS.NOT_EQUAL],
    size: 100,
    minSize: 80,
    maxSize: 130
  },
  weight_ounces: {
    column_id: 'weight_ounces',
    header_label: 'Weight (oz)',
    accessorKey: 'weight_ounces',
    accessorFn: ({ weight_ounces }) => {
      if (weight_ounces == null) return '—'
      return weight_ounces
    },
    data_type: TABLE_DATA_TYPES.NUMBER,
    operators: [
      TABLE_OPERATORS.GREATER_THAN,
      TABLE_OPERATORS.GREATER_THAN_OR_EQUAL,
      TABLE_OPERATORS.LESS_THAN,
      TABLE_OPERATORS.LESS_THAN_OR_EQUAL,
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL
    ],
    size: 110,
    minSize: 80,
    maxSize: 150
  },
  wattage: {
    column_id: 'wattage',
    header_label: 'Wattage',
    accessorKey: 'wattage',
    accessorFn: ({ wattage }) => {
      if (wattage == null) return '—'
      return `${wattage}W`
    },
    data_type: TABLE_DATA_TYPES.NUMBER,
    operators: [
      TABLE_OPERATORS.GREATER_THAN,
      TABLE_OPERATORS.GREATER_THAN_OR_EQUAL,
      TABLE_OPERATORS.LESS_THAN,
      TABLE_OPERATORS.LESS_THAN_OR_EQUAL,
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL
    ],
    size: 100,
    minSize: 70,
    maxSize: 140
  },
  voltage: {
    column_id: 'voltage',
    header_label: 'Voltage',
    accessorKey: 'voltage',
    accessorFn: ({ voltage }) => {
      if (voltage == null) return '—'
      return `${voltage}V`
    },
    data_type: TABLE_DATA_TYPES.NUMBER,
    operators: [
      TABLE_OPERATORS.GREATER_THAN,
      TABLE_OPERATORS.GREATER_THAN_OR_EQUAL,
      TABLE_OPERATORS.LESS_THAN,
      TABLE_OPERATORS.LESS_THAN_OR_EQUAL
    ],
    size: 100,
    minSize: 70,
    maxSize: 140
  },
  outlets_used: {
    column_id: 'outlets_used',
    header_label: 'Outlets',
    accessorKey: 'outlets_used',
    accessorFn: ({ outlets_used }) => {
      if (outlets_used == null) return '—'
      return outlets_used
    },
    data_type: TABLE_DATA_TYPES.NUMBER,
    operators: [
      TABLE_OPERATORS.GREATER_THAN,
      TABLE_OPERATORS.GREATER_THAN_OR_EQUAL,
      TABLE_OPERATORS.LESS_THAN,
      TABLE_OPERATORS.LESS_THAN_OR_EQUAL
    ],
    size: 90,
    minSize: 60,
    maxSize: 120
  },
  current_quantity: {
    column_id: 'current_quantity',
    header_label: 'Qty',
    accessorKey: 'current_quantity',
    accessorFn: ({ current_quantity }) => {
      if (current_quantity == null) return '—'
      return current_quantity
    },
    data_type: TABLE_DATA_TYPES.NUMBER,
    operators: [
      TABLE_OPERATORS.GREATER_THAN,
      TABLE_OPERATORS.GREATER_THAN_OR_EQUAL,
      TABLE_OPERATORS.LESS_THAN,
      TABLE_OPERATORS.LESS_THAN_OR_EQUAL,
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL
    ],
    size: 80,
    minSize: 60,
    maxSize: 120
  },
  target_quantity: {
    column_id: 'target_quantity',
    header_label: 'Target Qty',
    accessorKey: 'target_quantity',
    accessorFn: ({ target_quantity }) => {
      if (target_quantity == null) return '—'
      return target_quantity
    },
    data_type: TABLE_DATA_TYPES.NUMBER,
    operators: [
      TABLE_OPERATORS.GREATER_THAN,
      TABLE_OPERATORS.GREATER_THAN_OR_EQUAL,
      TABLE_OPERATORS.LESS_THAN,
      TABLE_OPERATORS.LESS_THAN_OR_EQUAL,
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL
    ],
    size: 100,
    minSize: 70,
    maxSize: 130
  },
  ethernet_connected: {
    column_id: 'ethernet_connected',
    header_label: 'Ethernet',
    accessorKey: 'ethernet_connected',
    accessorFn: ({ ethernet_connected }) => {
      if (ethernet_connected === true) return 'Yes'
      if (ethernet_connected === false) return 'No'
      return '—'
    },
    data_type: TABLE_DATA_TYPES.BOOLEAN,
    operators: [TABLE_OPERATORS.EQUAL, TABLE_OPERATORS.NOT_EQUAL],
    size: 100,
    minSize: 70,
    maxSize: 130
  },
  water_connection: {
    column_id: 'water_connection',
    header_label: 'Water',
    accessorKey: 'water_connection',
    accessorFn: ({ water_connection }) => {
      if (water_connection === true) return 'Yes'
      if (water_connection === false) return 'No'
      return '—'
    },
    data_type: TABLE_DATA_TYPES.BOOLEAN,
    operators: [TABLE_OPERATORS.EQUAL, TABLE_OPERATORS.NOT_EQUAL],
    size: 90,
    minSize: 60,
    maxSize: 120
  },
  tags: {
    column_id: 'tags',
    header_label: 'Tags',
    accessorKey: 'tags',
    component: TagsCell,
    data_type: TABLE_DATA_TYPES.SELECT,
    operators: [
      TABLE_OPERATORS.IN,
      TABLE_OPERATORS.NOT_IN,
      TABLE_OPERATORS.IS_EMPTY,
      TABLE_OPERATORS.IS_NOT_EMPTY
    ],
    column_values: [],
    size: 300,
    minSize: 150,
    maxSize: 450
  },
  created_at: {
    column_id: 'created_at',
    header_label: 'Created',
    accessorKey: 'created_at',
    accessorFn: ({ created_at }) => {
      if (!created_at) return '—'
      return format_shorthand_time(new Date(created_at))
    },
    data_type: TABLE_DATA_TYPES.DATE,
    operators: [
      TABLE_OPERATORS.GREATER_THAN,
      TABLE_OPERATORS.GREATER_THAN_OR_EQUAL,
      TABLE_OPERATORS.LESS_THAN,
      TABLE_OPERATORS.LESS_THAN_OR_EQUAL
    ],
    size: 60,
    minSize: 25,
    maxSize: 100
  },
  updated_at: {
    column_id: 'updated_at',
    header_label: 'Updated',
    accessorKey: 'updated_at',
    accessorFn: ({ updated_at }) => {
      if (!updated_at) return '—'
      return format_shorthand_time(new Date(updated_at))
    },
    data_type: TABLE_DATA_TYPES.DATE,
    operators: [
      TABLE_OPERATORS.GREATER_THAN,
      TABLE_OPERATORS.GREATER_THAN_OR_EQUAL,
      TABLE_OPERATORS.LESS_THAN,
      TABLE_OPERATORS.LESS_THAN_OR_EQUAL
    ],
    size: 60,
    minSize: 25,
    maxSize: 100
  }
}
