import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { get_directory_state } from '@core/directory'

import DirectoryPage from './DirectoryPage.js'

const map_state_to_props = createSelector(
  [get_directory_state],
  (directory_state) => ({
    directory_markdown: directory_state.get('directory_markdown')
  })
)

export default connect(map_state_to_props)(DirectoryPage)