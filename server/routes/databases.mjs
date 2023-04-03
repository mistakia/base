import express from 'express'
import { toBinaryUUID } from 'binary-uuid'

import db from '#db'
import { constants } from '#utils'

const router = express.Router({ mergeParams: true })

router.get('/:table_name', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { table_name, user_id } = req.params

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

    if (!database_table) {
      return res.status(404).send({ error: 'table not found' })
    }

    const formatted_table_name = is_default_table
      ? table_name
      : `${user_id}_${table_name}`
    const database_table_columns = await db('information_schema.columns')
      .select(
        'column_name as column_name',
        'table_name as table_name',
        'data_type as data_type'
      )
      .where('table_name', formatted_table_name)

    res.status(200).send({
      database_table,
      database_table_columns
    })
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

router.get('/:table_name/query', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { table_name, user_id } = req.params

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

    if (!database_table) {
      return res.status(404).send({ error: 'table not found' })
    }

    const formatted_table_name = is_default_table
      ? table_name
      : `${user_id}_${table_name}`
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
      // TODO validate sorting

      for (const sort of sorting) {
        sort.desc = sort.desc === 'true'
        database_query.orderByRaw(
          `${sort.id} ${sort.desc ? 'desc' : 'asc'} NULLS LAST`
        )
      }
    }

    if (columns) {
      // TODO validate columns

      // const table_name_index = {}
      for (const column of columns) {
        // TODO if we haven't joined this table yet, join it

        database_query.select(`${column.table_name}.${column.column_name}`)
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