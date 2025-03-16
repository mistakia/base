import { fileURLToPath } from 'url'
import './model_context_protocol/index.mjs'

export { default as get_tasks } from './get_tasks.mjs'
export { default as create_task } from './create_task.mjs'
export { default as get_task } from './get_task.mjs'
export * as constants from './constants.mjs'
export * as github from './github.mjs'
export * as cloudflare from './cloudflare.mjs'
export const isMain = (p) => process.argv[1] === fileURLToPath(p)
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export {
  register_provider,
  get_provider,
  list_providers,
  process_request
} from './model_context_protocol/service.mjs'
