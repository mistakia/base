// Re-export all filesystem functions
export {
  guideline_exists_in_filesystem,
  read_guideline_from_filesystem
} from './filesystem/index.mjs'

// Re-export all git functions
export { read_guideline_from_git } from './git/index.mjs'
