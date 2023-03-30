import { Record } from 'immutable'

import { dialog_actions } from './actions'

const DialogState = new Record({
  id: null,
  title: null,
  data: null,
  description: null,
  component: null,
  onConfirm: null
})

export function dialog_reducer(state = new DialogState(), { payload, type }) {
  switch (type) {
    case dialog_actions.SHOW_DIALOG:
      return state.merge(payload)

    case dialog_actions.CANCEL_DIALOG:
      return DialogState()

    default:
      return state
  }
}
