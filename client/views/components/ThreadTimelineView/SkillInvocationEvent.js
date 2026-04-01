import React, { useState, useCallback } from 'react'
import PropTypes from 'prop-types'

import '@styles/chip.styl'
import './SkillInvocationEvent.styl'
import MarkdownViewer from '@components/primitives/MarkdownViewer.js'
import ExpandToggle from '@components/primitives/ExpandToggle'
import { get_content_string } from './utils/detect-skill-invocations.js'

const skill_prop_shape = PropTypes.shape({
  command_name: PropTypes.string.isRequired,
  command_args: PropTypes.string,
  command_event: PropTypes.object.isRequired,
  expansion_event: PropTypes.object.isRequired,
  skill_path: PropTypes.string
})

const SkillChip = React.memo(({ skill }) => {
  const [is_expanded, set_is_expanded] = useState(false)
  const on_toggle = useCallback((e) => {
    e.stopPropagation()
    set_is_expanded((v) => !v)
  }, [])

  const { command_name, expansion_event, skill_path } = skill
  const expansion_content = get_content_string(expansion_event.content)

  return (
    <div className='skill-invocation__skill'>
      <div className='skill-invocation__skill-header'>
        <span
          className='skill-invocation__skill-chip'
          onClick={on_toggle}
          role='button'
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              on_toggle(e)
            }
          }}>
          {command_name}
        </span>
        {skill_path && (
          <span className='skill-invocation__skill-path'>{skill_path}</span>
        )}
        <ExpandToggle
          is_expanded={is_expanded}
          on_toggle={on_toggle}
          expanded_label='Collapse'
          collapsed_label='Expand'
        />
      </div>
      {is_expanded && (
        <div className='skill-invocation__expansion'>
          <MarkdownViewer content={expansion_content} />
        </div>
      )}
    </div>
  )
})

SkillChip.displayName = 'SkillChip'

SkillChip.propTypes = {
  skill: skill_prop_shape.isRequired
}

const SkillInvocationEvent = ({ skills, user_text }) => {
  return (
    <div className='skill-invocation'>
      <div className='skill-invocation__header'>
        <span className='chip skill-invocation__chip'>user</span>
      </div>
      <div className='skill-invocation__content'>
        {user_text && (
          <div className='skill-invocation__user-text'>
            <MarkdownViewer content={user_text} />
          </div>
        )}
        <div className='skill-invocation__skills'>
          {skills.map((skill, index) => (
            <SkillChip key={`${skill.command_name}-${index}`} skill={skill} />
          ))}
        </div>
      </div>
    </div>
  )
}

SkillInvocationEvent.propTypes = {
  skills: PropTypes.arrayOf(skill_prop_shape).isRequired,
  user_text: PropTypes.string
}

export default SkillInvocationEvent
