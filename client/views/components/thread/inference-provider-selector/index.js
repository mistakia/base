import React from 'react'
import { connect } from 'react-redux'
import { createSelector } from 'reselect'
import PropTypes from 'prop-types'

import { thread_actions, get_inference_providers } from '@core/thread'

const map_state_to_props = createSelector(
  get_inference_providers,
  (providers) => ({
    providers
  })
)

const map_dispatch_to_props = {
  fetch_providers: thread_actions.fetch_inference_providers_request
}

const InferenceProviderSelector = ({ providers, fetch_providers }) => {
  React.useEffect(() => {
    fetch_providers()
  }, [fetch_providers])

  return (
    <select className='inference-provider-selector'>
      <option value=''>Select a provider</option>
      {providers.map((provider) => (
        <option key={provider.name} value={provider.name}>
          {provider.display_name}
        </option>
      ))}
    </select>
  )
}

InferenceProviderSelector.propTypes = {
  providers: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      display_name: PropTypes.string.isRequired
    })
  ).isRequired,
  fetch_providers: PropTypes.func.isRequired
}

export default connect(
  map_state_to_props,
  map_dispatch_to_props
)(InferenceProviderSelector)
