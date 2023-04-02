import express from 'express'
import { toBinaryUUID } from 'binary-uuid'

import db from '#db'

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
        db.raw('BIN_TO_UUID(folder_id, true) as folder_id'),
        db.raw('BIN_TO_UUID(parent_folder_id, true) as parent_folder_id'),
        db.raw('BIN_TO_UUID(user_id, true) as user_id')
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
        db.raw('BIN_TO_UUID(folder_id, true) as folder_id'),
        db.raw('BIN_TO_UUID(parent_folder_id, true) as parent_folder_id')
      )
      .where({ parent_folder_id: toBinaryUUID(folder.folder_id) })

    // direct descendent tasks
    const tasks = await db('tasks')
      .select(
        '*',
        db.raw('BIN_TO_UUID(tasks.task_id, true) as task_id'),
        db.raw('BIN_TO_UUID(parent_folder_id, true) as parent_folder_id')
      )
      .join('task_folders', 'tasks.task_id', 'task_folders.task_id')
      .where({ parent_folder_id: toBinaryUUID(folder.folder_id) })

    // direct descendent physical items
    const physical_items = await db('physical_items')
      .select(
        '*',
        db.raw(
          'BIN_TO_UUID(physical_items.physical_item_id, true) as physical_item_id'
        ),
        db.raw('BIN_TO_UUID(parent_folder_id, true) as parent_folder_id')
      )
      .join(
        'physical_item_folders',
        'physical_items.physical_item_id',
        'physical_item_folders.physical_item_id'
      )
      .where({ parent_folder_id: toBinaryUUID(folder.folder_id) })

    // direct descendent digital items
    const digital_items = await db('digital_items')
      .select(
        '*',
        db.raw(
          'BIN_TO_UUID(digital_items.digital_item_id, true) as digital_item_id'
        ),
        db.raw('BIN_TO_UUID(parent_folder_id, true) as parent_folder_id')
      )
      .join(
        'digital_item_folders',
        'digital_items.digital_item_id',
        'digital_item_folders.digital_item_id'
      )
      .where({ parent_folder_id: toBinaryUUID(folder.folder_id) })

    // direct descendent database tables
    const database_tables = await db('database_tables')
      .select(
        '*',
        db.raw(
          'BIN_TO_UUID(database_tables.database_table_id, true) as database_table_id'
        ),
        db.raw('BIN_TO_UUID(parent_folder_id, true) as parent_folder_id')
      )
      .join(
        'database_table_folders',
        'database_tables.database_table_id',
        'database_table_folders.database_table_id'
      )
      .where({ parent_folder_id: toBinaryUUID(folder.folder_id) })

    // add default databases to root folder
    if (!folder.parent_folder_id) {
      const default_database_tables = [
        {
          table_id: 'DEFAULT_TASKS',
          table_name: 'tasks',
          table_description: 'A default database for all tasks for the user',
          user_id
        },
        {
          table_id: 'DEFAULT_PHYSICAL_ITEMS',
          table_name: 'physical_items',
          table_description:
            'A default database for all physical items for the user',
          user_id
        },
        {
          table_id: 'DEFAULT_DIGITAL_ITEMS',
          table_name: 'digital_items',
          table_description:
            'A default database for all digital items for the user',
          user_id
        },
        {
          table_id: 'DEFAULT_FOLDERS',
          table_name: 'folders',
          table_description: 'A default database for all folders for the user',
          user_id
        },
        {
          table_id: 'DEFAULT_ACTIVITIES',
          table_name: 'activities',
          table_description:
            'A default database for all activities for the user',
          user_id
        },
        {
          table_id: 'DEFAULT_ORGANIZATIONS',
          table_name: 'organizations',
          table_description:
            'A default database for all organizations for the user',
          user_id
        },
        {
          table_id: 'DEFAULT_PERSONS',
          table_name: 'persons',
          table_description: 'A default database for all persons for the user',
          user_id
        },
        {
          table_id: 'DEFAULT_PHYSICAL_LOCATIONS',
          table_name: 'physical_locations',
          table_descriptions:
            'A default database for all physical locations for the user',
          user_id
        }
      ]

      database_tables.push(...default_database_tables)
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
