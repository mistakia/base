import { fileURLToPath } from 'url'

export { default as get_tasks } from './get_tasks.mjs'
export { default as create_task } from './create_task.mjs'
export { default as get_task } from './get_task.mjs'
export * as constants from './constants.mjs'
export * as github from './github.mjs'
export const isMain = (p) => process.argv[1] === fileURLToPath(p)
