import { TASK_STATUS, TASK_PRIORITY } from './task-constants.mjs'

/**
 * Determines if a task should be displayed based on its status, priority, and dependencies
 * @param {Object} task - The task to evaluate
 * @param {Array} all_tasks - Array of all tasks to evaluate dependencies
 * @returns {boolean} Whether the task should be displayed
 */
export function should_display_task(task, all_tasks = []) {
  // Never show completed tasks
  if (task.status === TASK_STATUS.COMPLETED) {
    return false
  }

  // Always show high priority tasks
  if (
    task.priority === TASK_PRIORITY.HIGH ||
    task.priority === TASK_PRIORITY.CRITICAL
  ) {
    return true
  }

  // Show tasks that are actively being worked on
  if (
    task.status === TASK_STATUS.IN_PROGRESS ||
    task.status === TASK_STATUS.STARTED
  ) {
    return true
  }

  // Show blocked tasks and their blocking dependencies
  if (task.status === TASK_STATUS.BLOCKED) {
    return true
  }

  // Check if this task is blocking any high priority or in-progress tasks
  const is_blocking_important_task = all_tasks.some((other_task) => {
    const is_dependency = other_task.blocking_task_ids?.includes(task.task_id)
    if (!is_dependency) return false

    return (
      other_task.priority === TASK_PRIORITY.HIGH ||
      other_task.priority === TASK_PRIORITY.CRITICAL ||
      other_task.status === TASK_STATUS.IN_PROGRESS
    )
  })

  if (is_blocking_important_task) {
    return true
  }

  // Show child tasks of high priority parents
  const has_high_priority_parent = all_tasks.some((other_task) => {
    const is_parent = task.parent_task_ids?.includes(other_task.task_id)
    if (!is_parent) return false

    return (
      other_task.priority === TASK_PRIORITY.HIGH ||
      other_task.priority === TASK_PRIORITY.CRITICAL
    )
  })

  if (has_high_priority_parent) {
    return true
  }

  // Show parent tasks that have high priority children
  const has_high_priority_child = all_tasks.some((other_task) => {
    const is_child = task.child_task_ids?.includes(other_task.task_id)
    if (!is_child) return false

    return (
      other_task.priority === TASK_PRIORITY.HIGH ||
      other_task.priority === TASK_PRIORITY.CRITICAL
    )
  })

  if (has_high_priority_child) {
    return true
  }

  // Default to not showing other tasks
  return false
}

/**
 * Filter an array of tasks based on display criteria
 * @param {Array} tasks - Array of tasks to filter
 * @returns {Array} Filtered array of tasks that should be displayed
 */
export function filter_displayable_tasks(tasks = []) {
  return tasks.filter((task) => should_display_task(task, tasks))
}

/**
 * Sort tasks by priority and status
 * @param {Array} tasks - Array of tasks to sort
 * @returns {Array} Sorted array of tasks
 */
export function sort_tasks_by_importance(tasks = []) {
  const priority_order = {
    [TASK_PRIORITY.CRITICAL]: 0,
    [TASK_PRIORITY.HIGH]: 1,
    [TASK_PRIORITY.MEDIUM]: 2,
    [TASK_PRIORITY.LOW]: 3,
    [TASK_PRIORITY.NONE]: 4
  }

  const status_order = {
    [TASK_STATUS.IN_PROGRESS]: 0,
    [TASK_STATUS.BLOCKED]: 1,
    [TASK_STATUS.STARTED]: 2,
    [TASK_STATUS.PLANNED]: 3,
    [TASK_STATUS.WAITING]: 4,
    [TASK_STATUS.PAUSED]: 5,
    [TASK_STATUS.NO_STATUS]: 6
  }

  return [...tasks].sort((a, b) => {
    // First sort by priority
    const priority_diff =
      priority_order[a.priority] - priority_order[b.priority]
    if (priority_diff !== 0) return priority_diff

    // Then by status
    const status_diff = status_order[a.status] - status_order[b.status]
    if (status_diff !== 0) return status_diff

    // Finally by creation date (newer first)
    return new Date(b.created_at) - new Date(a.created_at)
  })
}
