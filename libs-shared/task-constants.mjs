export const TASK_STATUS = {
  NO_STATUS: 'No status',
  DRAFT: 'Draft',
  WAITING: 'Waiting',
  PAUSED: 'Paused',
  PLANNED: 'Planned',
  STARTED: 'Started',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  ABANDONED: 'Abandoned',
  BLOCKED: 'Blocked'
}

export const TASK_PRIORITY = {
  NONE: 'None',
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical'
}

export const TASK_PRIORITY_ORDER = {
  [TASK_PRIORITY.NONE]: 0,
  [TASK_PRIORITY.LOW]: 1,
  [TASK_PRIORITY.MEDIUM]: 2,
  [TASK_PRIORITY.HIGH]: 3,
  [TASK_PRIORITY.CRITICAL]: 4
}
