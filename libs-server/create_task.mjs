import db from '#db'

export default async function ({
  text_input,
  user_id,
  deadline_text_input,
  deadline,
  planned_start,
  planned_finish,
  status,

  dependent_on_task_ids = [],
  dependent_for_task_ids = [],

  parent_task_ids = [],
  child_task_ids = [],
  task_folder_paths = [],
  task_organization_ids = [],
  task_person_ids = [],
  task_physical_item_ids = [],
  task_digital_item_ids = []
}) {
  const [task_id] = await db('tasks').insert({
    text_input,
    user_id,
    deadline_text_input,
    deadline,
    planned_start,
    planned_finish,
    status
  })

  if (dependent_on_task_ids.length || dependent_for_task_ids.length) {
    // new task is dependent on other tasks
    const dependent_on = dependent_on_task_ids.map((dependent_on_task_id) => ({
      dependent_task_id: task_id,
      task_id: dependent_on_task_id
    }))

    // new task is dependent for other tasks
    const dependent_for = dependent_for_task_ids.map(
      (dependent_for_task_id) => ({
        task_id,
        dependent_task_id: dependent_for_task_id
      })
    )

    await db('task_dependencies').insert([...dependent_on, ...dependent_for])
  }

  if (parent_task_ids.length || child_task_ids.length) {
    // new task is a parent of other tasks
    const children = child_task_ids.map((child_task_id) => ({
      parent_task_id: task_id,
      child_task_id
    }))

    // new task is a child of other tasks
    const parents = parent_task_ids.map((parent_task_id) => ({
      child_task_id: task_id,
      parent_task_id
    }))

    await db('task_parents').insert([...children, ...parents])
  }

  if (task_folder_paths.length) {
    // make sure the folders exist
    await db('folders')
      .insert(
        task_folder_paths.map((task_folder_path) => ({
          folder_path: task_folder_path
        }))
      )
      .onConflict('folder_path')
      .ignore()

    await db('task_folders').insert(
      task_folder_paths.map((task_folder_path) => ({
        task_id,
        task_folder_path
      }))
    )
  }

  if (task_organization_ids.length) {
    await db('task_organizations').insert(
      task_organization_ids.map((task_organization_id) => ({
        task_id,
        task_organization_id
      }))
    )
  }

  if (task_person_ids.length) {
    await db('task_persons').insert(
      task_person_ids.map((task_person_id) => ({
        task_id,
        task_person_id
      }))
    )
  }

  if (task_physical_item_ids.length) {
    await db('task_physical_items').insert(
      task_physical_item_ids.map((task_physical_item_id) => ({
        task_id,
        task_physical_item_id
      }))
    )
  }

  if (task_digital_item_ids.length) {
    await db('task_digital_items').insert(
      task_digital_item_ids.map((task_digital_item_id) => ({
        task_id,
        task_digital_item_id
      }))
    )
  }

  return task_id
}
