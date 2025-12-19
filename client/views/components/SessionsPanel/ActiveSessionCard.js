import React from 'react'
import PropTypes from 'prop-types'
import { useNavigate } from 'react-router-dom'

import { format_shorthand_time } from '@views/utils/date-formatting.js'
import ProviderLogo from '@views/components/primitives/ProviderLogo.js'

const ActiveSessionCard = ({ session }) => {
  const navigate = useNavigate()

  const handle_click = () => {
    if (session.thread_id) {
      navigate(`/thread/${session.thread_id}`)
    }
  }

  const working_directory_path = session.working_directory
  const working_directory = working_directory_path
    ? working_directory_path.split('/').pop() || 'root'
    : 'Unknown'

  const last_activity = session.last_activity_at
    ? format_shorthand_time(session.last_activity_at)
    : 'just now'

  const status = session.status || 'active'
  const is_idle = status === 'idle'
  const has_thread = Boolean(session.thread_id)

  const get_status_label = () => {
    if (is_idle) return 'Idle'
    return 'Active'
  }

  return (
    <div
      className={`active-session-card ${has_thread ? 'active-session-card--clickable' : ''}`}
      onClick={has_thread ? handle_click : undefined}>
      <div className='active-session-card__main-row'>
        <span
          className={`active-session-card__dot ${is_idle ? 'active-session-card__dot--idle' : ''}`}
        />
        <span className='active-session-card__directory'>
          {working_directory}
        </span>
        <span className='active-session-card__provider'>
          <ProviderLogo
            provider='claude'
            size={16}
            className='active-session-card__provider-logo'
            title='Claude Code'
            decorative={false}
          />
        </span>
      </div>

      <div className='active-session-card__details-row'>
        <span className='active-session-card__status'>
          {get_status_label()}
        </span>
        <span className='active-session-card__separator'>-</span>
        <span className='active-session-card__time'>{last_activity}</span>
        {has_thread && (
          <>
            <span className='active-session-card__separator'>-</span>
            <span className='active-session-card__thread-link'>
              view thread
            </span>
          </>
        )}
      </div>
    </div>
  )
}

ActiveSessionCard.propTypes = {
  session: PropTypes.object.isRequired
}

export default ActiveSessionCard
