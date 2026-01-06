/**
 * RelatedEntities Component Export
 *
 * Provides a component for displaying related entities with Redux connection.
 */

import { connect } from 'react-redux'

import { get_app } from '@core/app/selectors'
import RelatedEntities from './RelatedEntities.js'
import RelatedEntitiesGroup from './RelatedEntitiesGroup.js'

const map_state_to_props = (state) => {
  const app = get_app(state)
  return {
    token: app.get('user_token')
  }
}

export default connect(map_state_to_props)(RelatedEntities)
export { RelatedEntities, RelatedEntitiesGroup }
