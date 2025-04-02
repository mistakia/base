import { Record } from 'immutable'
import { TASK_STATUS, TASK_PRIORITY } from '#libs-shared/task-constants.mjs'

const TaskRecord = Record({
  task_id: null,
  title: '',
  description: '',
  user_id: null,
  created_at: null,
  updated_at: null,
  status: TASK_STATUS.NO_STATUS,
  priority: TASK_PRIORITY.NONE,
  assigned_to: null,
  start_by: null,
  finish_by: null,
  estimated_total_duration: null,
  estimated_preparation_duration: null,
  estimated_execution_duration: null,
  estimated_cleanup_duration: null,
  actual_duration: null,
  planned_start: null,
  planned_finish: null,
  started_at: null,
  finished_at: null,
  snooze_until: null
})

export function create_task(task_data = {}) {
  return new TaskRecord(task_data)
}

export { TASK_STATUS, TASK_PRIORITY }
export default TaskRecord
