import db from '#db'

export default async function ({
  user_id,
  status,
  min_finish_by,
  max_finish_by,
  min_estimated_total_duration,
  max_estimated_total_duration,
  min_planned_start,
  max_planned_start,
  min_planned_finish,
  max_planned_finish
}) {
  const query = db('tasks').where({ user_id })

  if (status) {
    query.where({ status })
  }

  if (min_finish_by) {
    query.where('finish_by', '>=', min_finish_by)
  }

  if (max_finish_by) {
    query.where('finish_by', '<=', max_finish_by)
  }

  if (min_estimated_total_duration) {
    query.where('estimated_total_duration', '>=', min_estimated_total_duration)
  }

  if (max_estimated_total_duration) {
    query.where('estimated_total_duration', '<=', max_estimated_total_duration)
  }

  if (min_planned_start) {
    query.where('planned_start', '>=', min_planned_start)
  }

  if (max_planned_start) {
    query.where('planned_start', '<=', max_planned_start)
  }

  if (min_planned_finish) {
    query.where('planned_finish', '>=', min_planned_finish)
  }

  if (max_planned_finish) {
    query.where('planned_finish', '<=', max_planned_finish)
  }

  return query
}
