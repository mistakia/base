import { fileURLToPath } from 'url'
import { realpathSync } from 'fs'

export * as task from './task/index.mjs'
export * as github from './integrations/github/index.mjs'
export * as cloudflare from './integrations/cloudflare.mjs'
export const isMain = (p) => {
  const target = fileURLToPath(p)
  if (process.argv[1] === target) return true
  try {
    return realpathSync(process.argv[1]) === target
  } catch {
    return false
  }
}
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
export * as git from './git/index.mjs'
export * as markdown from './markdown/index.mjs'
export * as threads from './threads/index.mjs'
export * as prompts from './prompts/index.mjs'
export * as workflow from './workflow/index.mjs'
export * as guideline from './guideline/index.mjs'
export * as tag from './tag/index.mjs'
export * as sync from './sync/index.mjs'
export * as utils from './utils/index.mjs'
