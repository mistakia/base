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

// Re-export constants
export {
  SYSTEM_GUIDELINES_DIR,
  USER_GUIDELINES_DIR,
  get_system_guidelines_directory,
  get_user_guidelines_directory,
  resolve_guideline_path
} from './constants.mjs'
