import express from 'express'

import db from '#db'

const router = express.Router({ mergeParams: true })

router.get('/:tag_name*', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { tag_name } = req.params

    // get user_id from request
    const user_id = req.user.user_id

    const tag = await db('tags')
      .select('*', 'tag_id::text as tag_id', 'user_id::text as user_id')
      .where({
        tag_name,
        user_id
      })
      .first()

    if (!tag) {
      return res.status(404).send({ error: 'tag not found' })
    }

    // direct descendent tasks
    const tasks = await db('tasks')
      .select('*', 'tasks.task_id::text as task_id')
      .join('task_tags', 'tasks.task_id', 'task_tags.task_id')
      .where({ tag_id: tag.tag_id })

    // direct descendent physical items
    const physical_items = await db('physical_items')
      .select('*', 'physical_items.physical_item_id::text as physical_item_id')
      .join(
        'physical_item_tags',
        'physical_items.physical_item_id',
        'physical_item_tags.physical_item_id'
      )
      .where({ tag_id: tag.tag_id })

    // direct descendent digital items
    const digital_items = await db('digital_items')
      .select('*', 'digital_items.digital_item_id::text as digital_item_id')
      .join(
        'digital_item_tags',
        'digital_items.digital_item_id',
        'digital_item_tags.digital_item_id'
      )
      .where({ tag_id: tag.tag_id })

    // direct descendent database tables
    const database_tables = await db('database_tables')
      .select(
        '*',
        'database_tables.database_table_id::text as database_table_id'
      )
      .join(
        'database_table_tags',
        'database_tables.database_table_id',
        'database_table_tags.database_table_id'
      )
      .where({ tag_id: tag.tag_id })

    res.send({
      tag,
      tasks,
      physical_items,
      digital_items,
      database_tables
    })
  } catch (error) {
    log(error)
    res.status(500).send({ error: error.message })
  }
})

export default router
