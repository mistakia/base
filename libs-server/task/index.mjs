// Re-export filesystem functions
export {
  task_exists_in_filesystem,
  read_task_from_filesystem,
  write_task_to_filesystem
} from './filesystem/index.mjs'

// Re-export git functions
export { read_task_from_git, write_task_to_git } from './git/index.mjs'

// Re-export database functions
export { list_tasks_from_database } from './database/index.mjs'
