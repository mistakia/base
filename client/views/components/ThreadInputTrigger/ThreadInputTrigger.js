import React from 'react'
import PropTypes from 'prop-types'
import { useSelector, useDispatch } from 'react-redux'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'

import { thread_prompt_actions } from '@core/thread-prompt/index.js'
import { get_thread_pending_resume } from '@core/threads/selectors'

import './ThreadInputTrigger.styl'

const ThreadInputTrigger = ({ thread_id, thread_user_public_key }) => {
  const dispatch = useDispatch()

  const current_user_public_key = useSelector((state) =>
    state.getIn(['app', 'user_public_key'], null)
  )

  const is_prompt_open = useSelector((state) =>
    state.getIn(['thread_prompt', 'is_open'], false)
  )
  const prompt_thread_id = useSelector((state) =>
    state.getIn(['thread_prompt', 'thread_id'], null)
  )

  const pending_resume = useSelector((state) =>
    get_thread_pending_resume(state, thread_id)
  )

  const can_resume =
    current_user_public_key &&
    thread_user_public_key &&
    current_user_public_key === thread_user_public_key

  const has_pending_resume =
    pending_resume && pending_resume.get('status') !== 'failed'

  const is_targeting_this_thread =
    is_prompt_open && prompt_thread_id === thread_id

  if (!can_resume || has_pending_resume) {
    return null
  }

  const handle_click = () => {
    if (is_targeting_this_thread) return
    dispatch(
      thread_prompt_actions.open({
        thread_id,
        thread_user_public_key
      })
    )
  }

  const hidden = is_targeting_this_thread

  return (
    <div
      className={`thread-input-trigger${hidden ? ' thread-input-trigger--hidden' : ''}`}
      onClick={handle_click}>
      <span className='thread-input-trigger__placeholder'>
        Continue thread...
      </span>
      <span className='thread-input-trigger__icon'>
        <ArrowUpwardIcon style={{ fontSize: 14 }} />
      </span>
    </div>
  )
}

ThreadInputTrigger.propTypes = {
  thread_id: PropTypes.string.isRequired,
  thread_user_public_key: PropTypes.string
}

export default ThreadInputTrigger
