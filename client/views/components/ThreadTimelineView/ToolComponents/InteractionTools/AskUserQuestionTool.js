import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Box, List, ListItem } from '@mui/material'
import { HelpOutline as QuestionIcon } from '@mui/icons-material'

import BaseToolComponent from '@components/ThreadTimelineView/ToolComponents/BaseToolComponent'
import { MonospaceText } from '@components/primitives/styled'
import { build_dual_tone_header } from '@components/ThreadTimelineView/ToolComponents/shared/title-utils'

import './InteractionTools.styl'

const AskUserQuestionTool = ({ tool_call_event, tool_result_event }) => {
  const [show_options, set_show_options] = useState(false)

  const get_questions_info = () => {
    const params = tool_call_event?.content?.tool_parameters || {}
    const questions = params.questions || []
    return { questions }
  }

  const parse_answer = () => {
    if (!tool_result_event) return null

    const result = tool_result_event?.content?.result || ''
    if (typeof result !== 'string') return null

    // Result format: 'User has answered your questions: "Question"="Answer"'
    // Can have multiple: "Q1"="A1", "Q2"="A2"
    const answers = []
    const regex = /"([^"]+)"="([^"]+)"/g
    let match
    while ((match = regex.exec(result)) !== null) {
      answers.push({ question: match[1], answer: match[2] })
    }
    return answers.length > 0 ? answers : null
  }

  const truncate_text = (text, max_length = 60) => {
    if (!text || text.length <= max_length) return text
    return text.substring(0, max_length) + '...'
  }

  const render_options_list = () => {
    const { questions } = get_questions_info()
    const answers = parse_answer()

    return (
      <Box className='ask-user-question__content'>
        {questions.map((question, q_idx) => {
          const answered_item = answers?.find(
            (a) => a.question === question.question
          )

          return (
            <Box key={q_idx} className='ask-user-question__question-block'>
              {questions.length > 1 && (
                <MonospaceText
                  variant='xs'
                  className='ask-user-question__question-header'>
                  {question.header || `Question ${q_idx + 1}`}
                </MonospaceText>
              )}
              <MonospaceText
                variant='xs'
                className='ask-user-question__question-text'>
                {question.question}
              </MonospaceText>
              <List dense className='ask-user-question__options'>
                {question.options?.map((option, o_idx) => {
                  const is_selected =
                    answered_item?.answer === option.label ||
                    answered_item?.answer?.includes(option.label)

                  return (
                    <ListItem
                      key={o_idx}
                      className={`ask-user-question__option ${is_selected ? 'ask-user-question__option--selected' : ''}`}>
                      <Box
                        component='span'
                        className={`ask-user-question__option-indicator ${question.multiSelect ? 'ask-user-question__option-indicator--checkbox' : 'ask-user-question__option-indicator--radio'}`}
                        data-selected={is_selected}
                      />
                      <Box className='ask-user-question__option-content'>
                        <MonospaceText
                          variant='xs'
                          className='ask-user-question__option-label'>
                          {option.label}
                        </MonospaceText>
                        {option.description && (
                          <MonospaceText
                            variant='xs'
                            className='ask-user-question__option-description'>
                            {option.description}
                          </MonospaceText>
                        )}
                      </Box>
                    </ListItem>
                  )
                })}
              </List>
              {answered_item && (
                <Box className='ask-user-question__custom-answer'>
                  <MonospaceText
                    variant='xs'
                    color='var(--color-text-secondary)'>
                    Answer:{' '}
                  </MonospaceText>
                  <MonospaceText variant='xs' sx={{ fontWeight: 500 }}>
                    {answered_item.answer}
                  </MonospaceText>
                </Box>
              )}
            </Box>
          )
        })}
      </Box>
    )
  }

  const { questions } = get_questions_info()
  const answers = parse_answer()
  const first_question = questions[0]
  const first_answer = answers?.[0]

  const has_answer = Boolean(first_answer)
  const status_text = has_answer
    ? `Answered: "${truncate_text(first_answer.answer, 40)}"`
    : 'Waiting for response'

  const action_button =
    questions.length > 0 && questions[0]?.options?.length > 0
      ? {
          label: show_options ? 'hide' : 'show options',
          onClick: () => set_show_options(!show_options)
        }
      : null

  const header_node = build_dual_tone_header({
    left_label: 'Ask User',
    right_label: truncate_text(first_question?.question || 'Question', 50),
    action_button
  })

  return (
    <BaseToolComponent
      tool_call_event={tool_call_event}
      icon={<QuestionIcon fontSize='small' />}
      header={header_node}>
      <Box className='ask-user-question__status'>
        <Box
          component='span'
          className={`status-dot ${has_answer ? 'status-dot--answered' : 'status-dot--pending'}`}
        />
        <MonospaceText variant='xs' color='var(--color-text-secondary)'>
          {status_text}
        </MonospaceText>
      </Box>
      {show_options && render_options_list()}
    </BaseToolComponent>
  )
}

AskUserQuestionTool.propTypes = {
  tool_call_event: PropTypes.object.isRequired,
  tool_result_event: PropTypes.object
}

export default AskUserQuestionTool
