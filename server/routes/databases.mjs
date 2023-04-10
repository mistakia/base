import express from 'express'
import { toBinaryUUID } from 'binary-uuid'
import Validator from 'fastest-validator'

import * as table_constants from '../../../react-table/src/constants.mjs'

import db from '#db'
import { constants } from '#libs-server'
import config from '#config'

const v = new Validator({ haltOnFirstError: true })
const router = express.Router({ mergeParams: true })

const sort_schema = {
  type: 'array',
  items: {
    type: 'object',
    props: {
      id: { type: 'string' },
      desc: { type: 'boolean' }
    }
  }
}
const sort_validator = v.compile(sort_schema)

const columns_schema = {
  type: 'array',
  items: {
    type: 'object',
    props: {
      column_name: { type: 'string' },
      table_name: { type: 'string' }
    }
  }
}
const columns_validator = v.compile(columns_schema)

const view_name_schema = {
  $$root: true,
  type: 'string',
  min: 1,
  max: 30
}
const view_name_validator = v.compile(view_name_schema)

const view_description_schema = {
  $$root: true,
  type: 'string',
  min: 1,
  max: 400
}
const view_description_validator = v.compile(view_description_schema)

const table_state_schema = {
  sort: sort_schema,
  columns: columns_schema
}
const table_state_validator = v.compile(table_state_schema)

const get_database_table = async ({ table_name, user_id }) => {
  let database_table = constants.DEFAULT_DATABASE_TABLES.find(
    (d) => d.table_name === table_name
  )
  const is_default_table = Boolean(database_table)

  if (!database_table) {
    database_table = await db('database_tables')
      .select(
        '*',
        db.raw('BIN_TO_UUID(user_id, true) as user_id'),
        db.raw('BIN_TO_UUID(database_id, true) as database_id')
      )
      .where({ table_name, user_id: toBinaryUUID(user_id) })
      .first()
  }

  const formatted_table_name = is_default_table
    ? table_name
    : `${user_id}_${table_name}`

  return { database_table, formatted_table_name }
}

router.get('/:table_name', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { table_name, user_id } = req.params

    const { database_table, formatted_table_name } = await get_database_table({
      table_name,
      user_id
    })

    if (!database_table) {
      return res.status(404).send({ error: 'table not found' })
    }

    const database_table_columns = await db('information_schema.columns')
      .select(
        'column_name as column_name',
        'table_name as table_name',
        'data_type as data_type'
      )
      .where({
        table_name: formatted_table_name,
        table_schema: config.mysql.connection.database
      })
      .orderBy('ordinal_position', 'asc')

    const formatted_table_columns = database_table_columns.map((column) => ({
      ...column,
      accessorKey: column.column_name,
      header_label: column.column_name,
      data_type: table_constants.get_data_type(column.data_type)
    }))

    const database_table_views = await db('database_table_views')
      .select(
        '*',
        db.raw('BIN_TO_UUID(user_id, true) as user_id'),
        db.raw('BIN_TO_UUID(view_id, true) as view_id')
      )
      .where({
        table_name: formatted_table_name,
        user_id: toBinaryUUID(user_id)
      })

    res.status(200).send({
      database_table,
      database_table_views: database_table_views.map((view) => ({
        ...view,
        all_columns: formatted_table_columns
      })),
      database_table_columns: formatted_table_columns
    })
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

router.post('/:table_name/views', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { table_name, user_id } = req.params
    const { view_name, table_state, view_description } = req.body

    if (!view_name_validator(view_name)) {
      return res.status(400).send({ error: 'invalid view_name' })
    }

    if (!view_description_validator(view_description)) {
      return res.status(400).send({ error: 'invalid view_description' })
    }

    if (!table_state_validator(table_state)) {
      return res.status(400).send({ error: 'invalid table_state' })
    }

    const { database_table, formatted_table_name } = await get_database_table({
      table_name,
      user_id
    })

    if (!database_table) {
      return res.status(404).send({ error: 'table not found' })
    }

    await db('database_table_views').insert({
      view_name,
      view_description,
      table_state: JSON.stringify(table_state),
      table_name: formatted_table_name,
      user_id: toBinaryUUID(user_id)
    })

    const view = await db('database_table_views')
      .select(
        '*',
        db.raw('BIN_TO_UUID(user_id, true) as user_id'),
        db.raw('BIN_TO_UUID(view_id, true) as view_id')
      )
      .where({
        table_name: formatted_table_name,
        user_id: toBinaryUUID(user_id)
      })
      .first()

    res.status(200).send(view)
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

router.put('/:table_name/views/:view_id', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { table_name, user_id, view_id } = req.params
    const { view_name, table_state, view_description } = req.body

    if (!view_name_validator(view_name)) {
      return res.status(400).send({ error: 'invalid view_name' })
    }

    if (!view_description_validator(view_description)) {
      return res.status(400).send({ error: 'invalid view_description' })
    }

    if (!table_state_validator(table_state)) {
      return res.status(400).send({ error: 'invalid table_state' })
    }

    const { database_table, formatted_table_name } = await get_database_table({
      table_name,
      user_id
    })

    if (!database_table) {
      return res.status(404).send({ error: 'table not found' })
    }

    const current_view = await db('database_table_views')
      .where({
        view_id: toBinaryUUID(view_id),
        user_id: toBinaryUUID(user_id),
        table_name: formatted_table_name
      })
      .first()

    if (!current_view) {
      return res.status(404).send({ error: 'view not found' })
    }

    await db('database_table_views')
      .where({ view_id: toBinaryUUID(view_id) })
      .update({
        view_name,
        view_description,
        table_state: JSON.stringify(table_state)
      })

    const updated_view = await db('database_table_views')
      .select(
        '*',
        db.raw('BIN_TO_UUID(user_id, true) as user_id'),
        db.raw('BIN_TO_UUID(view_id, true) as view_id')
      )
      .where({
        table_name: formatted_table_name,
        user_id: toBinaryUUID(user_id)
      })
      .first()

    res.status(200).send(updated_view)
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

router.get('/:table_name/items', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { table_name, user_id } = req.params

    const { database_table, formatted_table_name } = await get_database_table({
      table_name,
      user_id
    })

    if (!database_table) {
      return res.status(404).send({ error: 'table not found' })
    }

    const database_query = db(formatted_table_name)
    database_query.select('*')

    const { limit, offset, sorting, columns } = req.query

    if (limit) {
      database_query.limit(limit)
    }

    if (offset) {
      database_query.offset(offset)
    }

    if (sorting) {
      if (!sort_validator(req.query.sorting)) {
        return res.status(400).send({ error: 'invalid sort query param' })
      }

      for (const sort of sorting) {
        database_query.orderByRaw(`ISNULL(${sort.id})`)
        sort.desc = sort.desc === 'true'
        database_query.orderByRaw(`${sort.id} ${sort.desc ? 'desc' : 'asc'}`)
      }
    }

    if (columns) {
      if (!columns_validator(req.query.columns)) {
        return res.status(400).send({ error: 'invalid columns query param' })
      }

      // const table_name_index = {}
      for (const column of columns) {
        // TODO if we haven't joined this table yet, join it

        if (
          Number(column.data_type) ===
          table_constants.TABLE_DATA_TYPES.BINARY_UUID
        ) {
          database_query.select(
            db.raw(
              `BIN_TO_UUID(${column.table_name}.${column.column_name}, true) as ${column.column_name}`
            )
          )
        } else {
          database_query.select(`${column.table_name}.${column.column_name}`)
        }
      }
    }

    const data = await database_query

    res.status(200).send(data)
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

export default router
