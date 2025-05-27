import { write_file_to_git } from './write-file-to-git.mjs'
import { delete_file_from_git } from './delete-file-from-git.mjs'
import { read_file_from_git } from './read-file-from-git.mjs'
import { file_exists_in_git } from './file-exists-in-git.mjs'
import { search_files_in_git } from './search-files-in-git.mjs'
import { list_files_in_git } from './list-files-in-git.mjs'
import { file_diff_in_git } from './file-diff-in-git.mjs'

export {
  write_file_to_git,
  delete_file_from_git,
  read_file_from_git,
  file_exists_in_git,
  search_files_in_git,
  list_files_in_git,
  file_diff_in_git
}

export default {
  write_file_to_git,
  delete_file_from_git,
  read_file_from_git,
  file_exists_in_git,
  search_files_in_git,
  list_files_in_git,
  file_diff_in_git
}
