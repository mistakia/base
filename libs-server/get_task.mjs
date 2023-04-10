import db from '#db'

export default async function ({ task_id }) {
  const task = await db('tasks').where({ task_id }).first()

  if (!task) {
    return null
  }

  const dependent_on = await db('task_dependencies')
    .where({ dependent_task_id: task_id })
    .select('task_id')

  const dependent_for = await db('task_dependencies')
    .where({ task_id })
    .select('dependent_task_id')

  const children = await db('task_parents')
    .where({ parent_task_id: task_id })
    .select('child_task_id')

  const parents = await db('task_parents')
    .where({ child_task_id: task_id })
    .select('parent_task_id')

  const task_folders = await db('task_folders')
    .where({ task_id })
    .select('folder_path')

  const task_organizations = await db('task_organizations')
    .where({ task_id })
    .select('organization_id')

  const task_persons = await db('task_persons')
    .where({ task_id })
    .select('person_id')

  return {
    ...task,
    dependent_on: dependent_on.map(({ task_id }) => task_id),
    dependent_for: dependent_for.map(
      ({ dependent_task_id }) => dependent_task_id
    ),
    children_task_ids: children.map(({ child_task_id }) => child_task_id),
    parents_task_ids: parents.map(({ parent_task_id }) => parent_task_id),
    task_folder_ids: task_folders.map(({ folder_path }) => folder_path),
    task_organization_ids: task_organizations.map(
      ({ organization_id }) => organization_id
    ),
    task_person_ids: task_persons.map(({ person_id }) => person_id)
  }
}
