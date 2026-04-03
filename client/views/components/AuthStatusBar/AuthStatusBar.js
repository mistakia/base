import React, { Component } from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'
import Ed25519 from 'nanocurrency-web/dist/lib/ed25519'
import { app_actions } from '@core/app/actions'
import {
  get_authentication_state,
  get_app
} from '@core/app/selectors'
import { format_public_key } from '@views/utils/format-public-key'

import './AuthStatusBar.styl'

class AuthStatusBar extends Component {
  static propTypes = {
    dispatch: PropTypes.func.isRequired,
    authentication_state: PropTypes.string,
    user_public_key: PropTypes.string,
    current_user: PropTypes.object,
    is_establishing_session: PropTypes.bool
  }

  state = {
    private_key_input: '',
    input_error: null
  }

  handle_private_key_change = (event) => {
    const input_value = event.target.value.replace(/[\s\r\n]/g, '')
    this.setState({
      private_key_input: input_value,
      input_error: null
    })

    if (input_value.length === 64) {
      this.submit_private_key(input_value)
    }
  }

  submit_private_key = (key) => {
    const { dispatch } = this.props

    if (!key || key.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(key)) {
      this.setState({
        input_error: 'Private key must be 64 hex characters'
      })
      return
    }

    try {
      const keys = new Ed25519().generateKeys(key)

      // Clear input immediately for better UX
      this.setState({ private_key_input: '', input_error: null })

      // Dispatch action to save keys and establish session
      dispatch(
        app_actions.load_from_private_key({
          user_private_key: key,
          user_public_key: keys.publicKey
        })
      )
    } catch (error) {
      this.setState({ input_error: 'Invalid private key' })
    }
  }

  handle_open_settings = () => {
    const { dispatch } = this.props
    dispatch(app_actions.open_user_settings())
  }

  handle_key_press = (event) => {
    if (event.key === 'Enter') {
      this.submit_private_key(this.state.private_key_input)
    }
  }

  handle_paste = (event) => {
    event.preventDefault()
    const pasted = (event.clipboardData || window.clipboardData).getData('text')
    const cleaned = pasted.replace(/[\s\r\n]/g, '')
    this.setState({ private_key_input: cleaned, input_error: null })
    if (cleaned.length === 64) {
      this.submit_private_key(cleaned)
    }
  }

  render_no_private_key() {
    const { private_key_input, input_error } = this.state
    const char_count = private_key_input.length

    return (
      <div className='auth-status-bar auth-status-bar--no-key'>
        <div className='auth-status-bar__container'>
          <div className='auth-status-bar__input-container'>
            <div className='auth-status-bar__tint-text'>TINT</div>
            <input
              type='password'
              value={private_key_input}
              onChange={this.handle_private_key_change}
              onKeyPress={this.handle_key_press}
              onPaste={this.handle_paste}
              className='auth-status-bar__key-input'
              placeholder='paste private key'
              style={{ '--char-count': char_count }}
            />
            {char_count > 0 && (
              <div
                className={`auth-status-bar__char-count ${char_count === 64 ? 'ready' : ''}`}>
                {char_count}/64
              </div>
            )}
            {input_error && (
              <div className='auth-status-bar__error'>{input_error}</div>
            )}
          </div>
        </div>
      </div>
    )
  }

  render_session_loading() {
    const { user_public_key, is_establishing_session } = this.props

    if (!user_public_key) return null

    const truncated_key = format_public_key(user_public_key)
    const status_text = is_establishing_session
      ? 'establishing session...'
      : 'unregistered key'

    return (
      <div className='auth-status-bar auth-status-bar--loading'>
        <div className='auth-status-bar__container'>
          <div className='auth-status-bar__status'>
            <span className='auth-status-bar__key'>{truncated_key}</span>
            <span className='auth-status-bar__loading'>{status_text}</span>
          </div>
        </div>
      </div>
    )
  }

  render_authenticated() {
    const { current_user, user_public_key } = this.props
    const username = current_user?.username || 'authenticated'
    const formatted_key = format_public_key(user_public_key)

    return (
      <div className='auth-status-bar auth-status-bar--authenticated'>
        <div
          className='auth-status-bar__container auth-status-bar__container--clickable'
          onClick={this.handle_open_settings}>
          <div className='auth-status-bar__user-info'>
            <span className='auth-status-bar__username'>{username}</span>
            <span className='auth-status-bar__public-key'>{formatted_key}</span>
          </div>
        </div>
      </div>
    )
  }

  render() {
    const { authentication_state } = this.props

    switch (authentication_state) {
      case 'no_private_key':
        return this.render_no_private_key()

      case 'no_session':
      case 'establishing_session':
        return this.render_session_loading()

      case 'authenticated':
        return this.render_authenticated()

      default:
        return this.render_no_private_key()
    }
  }
}

const mapStateToProps = (state) => {
  const app = get_app(state)
  return {
    authentication_state: get_authentication_state(state),
    user_public_key: app.get('user_public_key'),
    current_user: app.get('current_user'),
    is_establishing_session: app.get('is_establishing_session')
  }
}

export default connect(mapStateToProps)(AuthStatusBar)
