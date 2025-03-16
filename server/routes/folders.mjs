import express from 'express'

import db from '#db'
import { constants } from '#libs-server'

const router = express.Router({ mergeParams: true })

router.get('/:folder_path*', async (req, res) => {
  const { log } = req.app.locals
  try {
    const { folder_path } = req.params

    // ensure folder_path ends with a slash and starts with a slash
    const formatted_folder_path = `/${folder_path.replace(/^\/|\/$/g, '')}/`

    // get user_id from formatted_folder_path `/<user_id>/<folder_path>/`
    const user_id = formatted_folder_path.split('/')[1]

    const folder = await db('folders')
      .select(
        '*',
        'folder_id::text as folder_id',
        'parent_folder_id::text as parent_folder_id',
        'user_id::text as user_id'
      )
      .where({ folder_path: formatted_folder_path })
      .first()

    if (!folder) {
      return res.status(404).send({ error: 'folder not found' })
    }

    // direct descendent folders
    const folders = await db('folders')
      .select(
        '*',
        'folder_id::text as folder_id',
        'parent_folder_id::text as parent_folder_id'
      )
      .where({ parent_folder_id: folder.folder_id })

    // direct descendent tasks
    const tasks = await db('tasks')
      .select(
        '*',
        'tasks.task_id::text as task_id',
        'parent_folder_id::text as parent_folder_id'
      )
      .join('task_folders', 'tasks.task_id', 'task_folders.task_id')
      .where({ parent_folder_id: folder.folder_id })

    // direct descendent physical items
    const physical_items = await db('physical_items')
      .select(
        '*',
        'physical_items.physical_item_id::text as physical_item_id',
        'parent_folder_id::text as parent_folder_id'
      )
      .join(
        'physical_item_folders',
        'physical_items.physical_item_id',
        'physical_item_folders.physical_item_id'
      )
      .where({ parent_folder_id: folder.folder_id })

    // direct descendent digital items
    const digital_items = await db('digital_items')
      .select(
        '*',
        'digital_items.digital_item_id::text as digital_item_id',
        'parent_folder_id::text as parent_folder_id'
      )
      .join(
        'digital_item_folders',
        'digital_items.digital_item_id',
        'digital_item_folders.digital_item_id'
      )
      .where({ parent_folder_id: folder.folder_id })

    // direct descendent database tables
    const database_tables = await db('database_tables')
      .select(
        '*',
        'database_tables.database_table_id::text as database_table_id',
        'parent_folder_id::text as parent_folder_id'
      )
      .join(
        'database_table_folders',
        'database_tables.database_table_id',
        'database_table_folders.database_table_id'
      )
      .where({ parent_folder_id: folder.folder_id })

    // add default databases to root folder
    if (!folder.parent_folder_id) {
      const default_tables = constants.DEFAULT_DATABASE_TABLES.map((d) => ({
        ...d,
        user_id
      }))
      database_tables.push(...default_tables)
    }

    res.send({
      folder,
      folders,
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
