// Re-export filesystem functions
export {
  guideline_exists_in_filesystem,
  read_guideline_from_filesystem
} from './filesystem/index.mjs'

// Re-export git functions
export {
  guideline_exists_in_git,
  read_guideline_from_git
} from './git/index.mjs'
