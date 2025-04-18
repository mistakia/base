import express from 'express'
import Validator from 'fastest-validator'

import * as table_constants from '../../../react-table/src/constants.mjs'

import db from '#db'

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

const where_operator_schema = {
  type: 'string',
  enum: [
    '=',
    '!=',
    '>',
    '>=',
    '<',
    '<=',
    'LIKE',
    'NOT LIKE',
    'IS NULL',
    'IS NOT NULL',
    'IN',
    'NOT IN'
  ]
}

const where_schema = {
  type: 'array',
  items: {
    type: 'object',
    props: {
      column_name: { type: 'string' },
      operator: where_operator_schema,
      value: { type: 'string' }
    }
  }
}

const where_validator = v.compile(where_schema)

const table_state_schema = {
  sort: sort_schema,
  columns: columns_schema,
  where: where_schema
}
const table_state_validator = v.compile(table_state_schema)

router.get('/:table_name', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { table_name, user_id } = req.params

    // TODO
    // get the database table entity & metadata
    // get the database table views

    res.status(200).send({
      database_table: null,
      database_table_views: []
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
    const { view_id, view_name, table_state, view_description } = req.body

    if (!view_name_validator(view_name)) {
      return res.status(400).send({ error: 'invalid view_name' })
    }

    if (!view_description_validator(view_description)) {
      return res.status(400).send({ error: 'invalid view_description' })
    }

    if (!table_state_validator(table_state)) {
      return res.status(400).send({ error: 'invalid table_state' })
    }

    // TODO
    // validate view table state
    // save view & table state

    res.status(200).send({ view: null })
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

router.delete('/:table_name/views/:view_id', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { table_name, user_id, view_id } = req.params

    // TODO

    res.status(200).send({ success: true })
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

router.get('/:table_name/views/:view_id', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { table_name, user_id, view_id } = req.params

    // TODO
    // Get the view & table state
    // Execute the table state query
    // Return the results

    res.status(200).send({})
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

export default router
