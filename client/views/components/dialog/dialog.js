import React from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'
import Button from '@mui/material/Button'
import MuiDialog from '@mui/material/Dialog'
import MuidialogActions from '@mui/material/dialogActions'
import MuiDialogContent from '@mui/material/DialogContent'
import MuiDialogContentText from '@mui/material/DialogContentText'
import MuiDialogTitle from '@mui/material/DialogTitle'

export default class Dialog extends React.Component {
  handle_click = (args) => {
    this.props.info.onConfirm(args)
    this.props.cancel()
  }

  handle_close = () => {
    this.props.cancel()
  }

  render = () => {
    if (this.props.info.id) {
      const get_component = (id) => {
        switch (id) {
          default:
            return null
        }
      }
      const DialogComponent = get_component(this.props.info.id)
      const { data } = this.props.info
      return (
        <DialogComponent
          onClose={this.handle_close}
          onSubmit={this.handle_click}
          {...data}
        />
      )
    }

    return (
      <MuiDialog
        open={Boolean(this.props.info.title)}
        onClose={this.handle_close}>
        <MuiDialogTitle>{this.props.info.title}</MuiDialogTitle>
        <MuiDialogContent>
          <MuiDialogContentText>
            {this.props.info.description}
          </MuiDialogContentText>
        </MuiDialogContent>
        <MuidialogActions>
          <Button onClick={this.handle_close} text>
            Cancel
          </Button>
          <Button onClick={this.handle_click} text>
            Confirm
          </Button>
        </MuidialogActions>
      </MuiDialog>
    )
  }
}

Dialog.propTypes = {
  info: ImmutablePropTypes.record,
  cancel: PropTypes.func
}
