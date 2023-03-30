import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { dialog_actions, get_dialog_info } from '@core/dialog'

import Dialog from './dialog'

const mapStateToProps = createSelector(get_dialog_info, (info) => ({
  info
}))

const mapDispatchToProps = {
  cancel: dialog_actions.cancel
}

export default connect(mapStateToProps, mapDispatchToProps)(Dialog)
