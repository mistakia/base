import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { get_entity_state } from '@core/entity/selectors'
import { entity_actions } from '@core/entity'

import EntityDetailPage from './entity-detail-page'

const map_state_to_props = createSelector(get_entity_state, (entities) => ({
  entities
}))

const map_dispatch_to_props = {
  load_entity: entity_actions.load_entity
}

export default connect(
  map_state_to_props,
  map_dispatch_to_props
)(EntityDetailPage)
