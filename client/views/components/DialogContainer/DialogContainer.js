import React from 'react'
import { useSelector, useDispatch } from 'react-redux'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions
} from '@mui/material'

import Button from '@components/primitives/Button'
import { get_dialog_info } from '@core/dialog/selectors'
import { dialog_actions } from '@core/dialog/actions'
import ThreadStateDialog from '@components/ThreadStateDialog'

const DialogContainer = () => {
  const dispatch = useDispatch()
  const dialog_info = useSelector(get_dialog_info)

  const dialog_id = dialog_info?.get('id')
  const dialog_title = dialog_info?.get('title')
  const dialog_description = dialog_info?.get('description')
  const dialog_data = dialog_info?.get('data')
  const on_confirm = dialog_info?.get('onConfirm')

  const handle_close = () => {
    dispatch(dialog_actions.cancel())
  }

  const handle_confirm = () => {
    if (on_confirm) {
      on_confirm()
    }
    dispatch(dialog_actions.cancel())
  }

  // Handle specific dialog types
  if (dialog_id === 'THREAD_STATE_CHANGE') {
    return (
      <ThreadStateDialog
        open={true}
        onClose={handle_close}
        thread_id={dialog_data?.thread_id}
        current_state={dialog_data?.current_state}
      />
    )
  }

  // Generic confirmation dialog fallback
  if (dialog_id) {
    return (
      <Dialog
        open={true}
        onClose={handle_close}
        maxWidth='sm'
        fullWidth
        PaperProps={{
          sx: { borderRadius: 0 }
        }}>
        {dialog_title && <DialogTitle>{dialog_title}</DialogTitle>}

        {dialog_description && (
          <DialogContent>
            <DialogContentText>{dialog_description}</DialogContentText>
          </DialogContent>
        )}

        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button variant='secondary' onClick={handle_close}>
            Cancel
          </Button>
          {on_confirm && (
            <Button variant='primary' onClick={handle_confirm}>
              Confirm
            </Button>
          )}
        </DialogActions>
      </Dialog>
    )
  }

  // No dialog to show
  return null
}

export default DialogContainer
