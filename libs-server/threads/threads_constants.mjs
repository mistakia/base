import path from 'path'
import config from '#config'

export const THREAD_CONTEXT_DIR = 'threads'
export const THREAD_BASE_DIRECTORY = path.join(
  config.user_base_directory,
  THREAD_CONTEXT_DIR
)
