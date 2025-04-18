import React, { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'

import './floating-thread-form.styl'

const FloatingThreadForm = ({
  providers,
  providers_loading,
  providers_error,
  thread_loading,
  thread_error,
  user_id,
  load_providers,
  create_thread
}) => {
  const [form_state, set_form_state] = useState({
    provider: '',
    model: '',
    initial_message: '',
    tools: []
  })

  const [available_models, set_available_models] = useState([])
  const [context_items, set_context_items] = useState([])
  const textarea_ref = useRef(null)

  // Load providers on mount
  useEffect(() => {
    load_providers()
  }, [load_providers])

  // Update available models when provider changes
  useEffect(() => {
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

  // Auto-resize textarea based on content
  useEffect(() => {
    const adjust_textarea_height = () => {
      const textarea = textarea_ref.current
      if (textarea) {
        // Reset height to auto to get the correct scrollHeight
        textarea.style.height = 'auto'
        console.log(textarea.scrollHeight)
        // Set height to scrollHeight to fit content
        textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
      }
    }

    adjust_textarea_height()
  }, [form_state.initial_message])

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
    // Clear form after submission
    set_form_state({
      ...form_state,
      initial_message: ''
    })
  }

  // Handle key down events
  const handle_key_down = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handle_submit(e)
    }
  }

  // Add context item
  // const add_context_item = (item) => {
  //   set_context_items([...context_items, item])
  // }

  // Remove context item
  const remove_context_item = (index) => {
    set_context_items(context_items.filter((_, i) => i !== index))
  }

  return (
    <div className='floating-thread-form'>
      <div className='form-header'>
        <div className='context-chips'>
          {context_items.map((item, index) => (
            <div key={index} className='context-chip'>
              <span>{item.label}</span>
              <button
                type='button'
                className='remove-chip'
                onClick={() => remove_context_item(index)}>
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className='message-area'>
        <textarea
          ref={textarea_ref}
          className='message-input'
          name='initial_message'
          value={form_state.initial_message}
          onChange={handle_change}
          onKeyDown={handle_key_down}
          placeholder='Enter your message to the AI...'
          disabled={thread_loading}
          rows={1}
          autoFocus
        />
      </div>

      <div className='form-footer'>
        <div className='model-selection'>
          <select
            className='provider-select'
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

          <select
            className='model-select'
            name='model'
            value={form_state.model}
            onChange={handle_change}
            disabled={!form_state.provider || thread_loading}>
            <option value=''>Select a model</option>
            {available_models.map((model) => (
              <option key={model.name} value={model.name}>
                {model.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type='button'
          className='submit-button'
          onClick={handle_submit}
          disabled={
            !form_state.provider ||
            !form_state.model ||
            !form_state.initial_message ||
            thread_loading
          }>
          {thread_loading ? 'Sending...' : 'Send'}
        </button>
      </div>

      {thread_error && <div className='error-message'>{thread_error}</div>}
    </div>
  )
}

FloatingThreadForm.propTypes = {
  providers: PropTypes.object,
  providers_loading: PropTypes.bool,
  providers_error: PropTypes.any,
  thread_loading: PropTypes.bool,
  thread_error: PropTypes.any,
  user_id: PropTypes.string,
  load_providers: PropTypes.func.isRequired,
  create_thread: PropTypes.func.isRequired
}

export default FloatingThreadForm
