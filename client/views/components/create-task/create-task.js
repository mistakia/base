import React from 'react'
import PropTypes from 'prop-types'
import TextField from '@mui/material/TextField'

import './create-task.styl'

export default function CreateTask({ create_user_task }) {
  const [text_input, set_text_input] = React.useState('')

  const on_submit = () => {
    if (text_input) {
      create_user_task({ text_input })
    }
  }

  return (
    <div className='create-task'>
      <TextField
        multiline={true}
        placeholder='Start typing to create a task'
        value={text_input}
        onChange={() => set_text_input(event.target.value)}
        fullWidth
        onKeyDown={(e) => {
          if (e.keyCode === 13) {
            e.preventDefault() // prevent default behavior of "enter" key press
            on_submit()
          }
        }}
      />
    </div>
  )
}

CreateTask.propTypes = {
  create_user_task: PropTypes.func.isRequired
}
