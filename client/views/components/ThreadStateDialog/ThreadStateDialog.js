import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { useDispatch } from 'react-redux'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography,
  Box
} from '@mui/material'

import { dialog_actions } from '@core/dialog/actions'
import { threads_actions } from '@core/threads/actions'

const ThreadStateDialog = ({ open, onClose, thread_id, current_state }) => {
  const dispatch = useDispatch()
  const [selected_action, set_selected_action] = useState('')

  const is_archived = current_state === 'archived'

  const handle_submit = () => {
    if (!selected_action) return

    if (selected_action === 'reactivate') {
      dispatch(
        threads_actions.set_thread_archive_state({
          thread_id,
          archive_reason: null,
          archived_at: null
        })
      )
    } else {
      dispatch(
        threads_actions.set_thread_archive_state({
          thread_id,
          archive_reason: selected_action,
          archived_at: new Date().toISOString()
        })
      )
    }

    dispatch(dialog_actions.cancel())
  }

  const handle_cancel = () => {
    set_selected_action('')
    dispatch(dialog_actions.cancel())
  }

  return (
    <Dialog open={open} onClose={handle_cancel} maxWidth='sm' fullWidth>
      <DialogTitle>
        {is_archived ? 'Reactivate Thread' : 'Archive Thread'}
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mt: 2 }}>
          {is_archived ? (
            <Box>
              <Typography variant='body1' sx={{ mb: 2 }}>
                This thread is currently archived. Would you like to reactivate
                it?
              </Typography>
              <FormControl component='fieldset'>
                <RadioGroup
                  value={selected_action}
                  onChange={(e) => set_selected_action(e.target.value)}>
                  <FormControlLabel
                    value='reactivate'
                    control={<Radio />}
                    label='Reactivate thread'
                  />
                </RadioGroup>
              </FormControl>
            </Box>
          ) : (
            <Box>
              <Typography variant='body1' sx={{ mb: 2 }}>
                Select a reason for archiving this thread:
              </Typography>
              <FormControl component='fieldset'>
                <RadioGroup
                  value={selected_action}
                  onChange={(e) => set_selected_action(e.target.value)}>
                  <FormControlLabel
                    value='completed'
                    control={<Radio />}
                    label='Thread completed'
                  />
                  <FormControlLabel
                    value='user_abandoned'
                    control={<Radio />}
                    label='User abandoned'
                  />
                </RadioGroup>
              </FormControl>
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handle_cancel}>Cancel</Button>
        <Button
          onClick={handle_submit}
          variant='contained'
          disabled={!selected_action}
          color={is_archived ? 'primary' : 'warning'}>
          {is_archived ? 'Reactivate' : 'Archive'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

ThreadStateDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  thread_id: PropTypes.string,
  current_state: PropTypes.string
}

export default ThreadStateDialog
