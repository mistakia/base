import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { get_directory_state } from '@core/directory'

import DirectoryPage from './DirectoryPage.js'

const map_state_to_props = createSelector(
  [get_directory_state],
  (directory_state) => {
    const path_info = directory_state.get('path_info')
    const is_directory = path_info?.type === 'directory'

    return {
      directory_markdown:
        directory_state.get('directory_markdown_file')?.content || null,
      is_loading_directory_markdown: directory_state.get(
        'is_loading_directory_markdown'
      ),
      directory_markdown_error: directory_state.get('directory_markdown_error'),
      is_directory
    }
  }
)

export default connect(map_state_to_props)(DirectoryPage)
