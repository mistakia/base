import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import {
  get_activity_heatmap_data,
  get_activity_max_score
} from '@core/activity/selectors'
import { activity_actions } from '@core/activity/actions'

import ActivityHeatmap from './ActivityHeatmap'

const map_state_to_props = createSelector(
  [get_activity_heatmap_data, get_activity_max_score],
  (heatmap_data, max_score) => ({
    heatmap_data,
    max_score
  })
)

const map_dispatch_to_props = {
  load_activity_heatmap: activity_actions.load_activity_heatmap
}

export default connect(
  map_state_to_props,
  map_dispatch_to_props
)(ActivityHeatmap)
