import express from 'express'
import Validator from 'fastest-validator'

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

const view_id_schema = {
  $$root: true,
  type: 'uuid'
}
const view_id_validator = v.compile(view_id_schema)

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

const table_state_schema = {
  sort: sort_schema,
  columns: columns_schema,
  where: where_schema
}
const table_state_validator = v.compile(table_state_schema)

router.get('/:table_name', async (req, res) => {
  const { log } = req.app.locals
  try {
    // const { table_name, user_public_key } = req.params

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
    // const { table_name, user_public_key } = req.params
    const { view_id, view_name, table_state, view_description } = req.body

    if (!view_id_validator(view_id)) {
      return res.status(400).send({ error: 'invalid view_id' })
    }

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
    const { view_id } = req.params

    if (!view_id_validator(view_id)) {
      return res.status(400).send({ error: 'invalid view_id' })
    }

    // Note: This functionality needs to be redesigned for file-based operations
    // The current implementation requires entity_id -> file_path mapping
    // For now, return not implemented error
    return res.status(501).send({
      error:
        'Database view operations not yet implemented for file-first architecture'
    })
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

router.get('/:table_name/views/:view_id', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { table_name, view_id } = req.params

    if (!table_name) {
      return res.status(400).send({ error: 'invalid table_name' })
    }

    if (!view_id) {
      return res.status(400).send({ error: 'invalid view_id' })
    }

    // Note: This functionality needs to be redesigned for file-based operations
    // The current implementation requires entity_id -> file_path mapping
    // For now, return not implemented error
    return res.status(501).send({
      error:
        'Database view operations not yet implemented for file-first architecture'
    })
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

export default router
