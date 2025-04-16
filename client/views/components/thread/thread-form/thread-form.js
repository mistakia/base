import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'

import './thread-form.styl'

const ThreadForm = ({
  providers,
  providers_loading,
  providers_error,
  thread_loading,
  thread_error,
  user_id,
  load_providers,
  create_thread,
  onCancel
}) => {
  const [form_state, set_form_state] = useState({
    provider: '',
    model: '',
    initial_message: '',
    tools: []
  })

  const [available_models, set_available_models] = useState([])

  // Load providers on mount
  useEffect(() => {
    load_providers()
  }, [load_providers])

  // Update available models when provider changes
  useEffect(() => {
    console.log({
      form_state,
      providers: providers?.toJS()
    })
    if (form_state.provider && providers) {
      const selected_provider = providers.find(
        (p) => p.get('name') === form_state.provider
      )

      if (selected_provider) {
        set_available_models(selected_provider.get('models').toJS())
        // Auto-select first model if available
        if (selected_provider.get('models').size > 0 && !form_state.model) {
          const first_model = selected_provider.get('models').get(0)
          set_form_state((prev) => ({
            ...prev,
            model: first_model.get('name')
          }))
        }
      }
    } else if (providers && providers.size > 0 && !form_state.provider) {
      // Auto-select first provider when providers load if none is selected
      const first_provider = providers.get(0)
      set_form_state((prev) => ({
        ...prev,
        provider: first_provider.get('name')
      }))
    }
  }, [form_state.provider, form_state.model, providers])

  // Handle input changes
  const handle_change = (e) => {
    const { name, value } = e.target
    set_form_state((prev) => ({
      ...prev,
      [name]: value
    }))
  }

  // Handle form submission
  const handle_submit = (e) => {
    e.preventDefault()
    create_thread({
      inference_provider: form_state.provider,
      model: form_state.model,
      initial_message: form_state.initial_message,
      tools: form_state.tools
    })
  }

  if (providers_loading) {
    return <div className='loading'>Loading providers...</div>
  }

  if (providers_error) {
    return <div className='error-message'>{providers_error}</div>
  }

  return (
    <div className='form-container'>
      <form onSubmit={handle_submit}>
        <div className='form-group'>
          <label className='label' htmlFor='provider'>
            Provider
          </label>
          <select
            className='select'
            id='provider'
            name='provider'
            value={form_state.provider}
            onChange={handle_change}
            disabled={thread_loading}>
            <option value=''>Select a provider</option>
            {providers &&
              providers.map((provider) => (
                <option key={provider.get('name')} value={provider.get('name')}>
                  {provider.get('display_name')}
                </option>
              ))}
          </select>
          {providers_error && (
            <div className='error-message'>{providers_error}</div>
          )}
        </div>

        <div className='form-group'>
          <label className='label' htmlFor='model'>
            Model
          </label>
          <select
            className='select'
            id='model'
            name='model'
            value={form_state.model}
            onChange={handle_change}
            disabled={!form_state.provider || thread_loading}>
            <option value=''>Select a model</option>
            {available_models.map((model) => (
              <option key={model.name} value={model.name}>
                {model.name}{' '}
                {model.modified_at &&
                  `(Updated: ${new Date(model.modified_at).toLocaleDateString()})`}
              </option>
            ))}
          </select>
        </div>

        <div className='form-group'>
          <label className='label' htmlFor='initial_message'>
            Initial Message
          </label>
          <textarea
            className='textarea'
            id='initial_message'
            name='initial_message'
            value={form_state.initial_message}
            onChange={handle_change}
            placeholder='Enter your initial message to the AI...'
            disabled={thread_loading}
          />
          <div className='help-text'>
            This message will start the conversation with the AI
          </div>
        </div>

        {thread_error && <div className='error-message'>{thread_error}</div>}

        <div className='button-group'>
          <button
            type='submit'
            className='submit-button'
            disabled={
              !form_state.provider ||
              !form_state.model ||
              !form_state.initial_message ||
              thread_loading
            }>
            {thread_loading ? 'Creating...' : 'Create Thread'}
          </button>
          <button
            type='button'
            className='cancel-button'
            onClick={onCancel}
            disabled={thread_loading}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

ThreadForm.propTypes = {
  providers: PropTypes.object,
  providers_loading: PropTypes.bool,
  providers_error: PropTypes.any,
  thread_loading: PropTypes.bool,
  thread_error: PropTypes.any,
  user_id: PropTypes.string,
  load_providers: PropTypes.func.isRequired,
  create_thread: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired
}

export default ThreadForm
