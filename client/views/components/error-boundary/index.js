import React from 'react'
import PropTypes from 'prop-types'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      has_error: false,
      error: null,
      error_info: null
    }
  }

  static get_derived_state_from_error(error) {
    return { has_error: true, error }
  }

  component_did_catch(error, error_info) {
    // Log the error to an error reporting service if needed
    console.error('Error caught by boundary:', error, error_info)
    this.setState({
      error_info
    })
  }

  handle_retry = () => {
    this.setState({
      has_error: false,
      error: null,
      error_info: null
    })
  }

  render() {
    if (this.state.has_error) {
      // You can render any custom fallback UI
      return (
        <div className='error-boundary-fallback'>
          <h3>Something went wrong</h3>
          <p className='error-message'>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          {this.props.can_retry && (
            <button className='retry-button' onClick={this.handle_retry}>
              Try again
            </button>
          )}
        </div>
      )
    }

    return this.props.children
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
  can_retry: PropTypes.bool
}

ErrorBoundary.defaultProps = {
  can_retry: true
}

export default ErrorBoundary
