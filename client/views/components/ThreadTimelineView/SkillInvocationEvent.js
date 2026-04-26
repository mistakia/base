import React, { useState, useCallback } from 'react'
import PropTypes from 'prop-types'

import '@styles/chip.styl'
import './UserMessage.styl'
import './SkillInvocationEvent.styl'
import MarkdownViewer from '@components/primitives/MarkdownViewer.js'
import ExpandToggle from '@components/primitives/ExpandToggle'
import { get_content_string } from './utils/detect-skill-invocations.js'

const skill_path_to_url = ({ skill_path }) => {
  if (!skill_path) return null
  // Convert absolute path to relative URL by stripping user-base prefix
  // Skill paths look like: /Users/.../user-base/.claude/skills/wrap-up
  // or /Users/.../user-base/extension/name/skill/name.md
  const markers = ['/extension/', '/.claude/']
  for (const marker of markers) {
    const marker_index = skill_path.indexOf(marker)
    if (marker_index !== -1) {
      return skill_path.substring(marker_index + 1)
    }
  }
  return null
}

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
  const file_url = skill_path_to_url({ skill_path })

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
        {file_url && (
          <a
            className='skill-invocation__skill-link'
            href={`/${file_url}`}
            target='_blank'
            rel='noopener noreferrer'
            onClick={(e) => e.stopPropagation()}>
            {file_url}
          </a>
        )}
        <ExpandToggle
          className='skill-invocation__expand-toggle'
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
    <div className='user-message skill-invocation'>
      <div className='user-message__header'>
        <span className='chip user-message__chip'>user</span>
      </div>
      <div className='user-message__content'>
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
