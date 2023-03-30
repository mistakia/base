export const dialog_actions = {
  SHOW_DIALOG: 'SHOW_DIALOG',
  CANCEL_DIALOG: 'CANCEL_DIALOG',

  show: ({ title, description, id, onConfirm, data }) => ({
    type: dialog_actions.SHOW_DIALOG,
    payload: {
      title,
      data,
      description,
      id,
      onConfirm
    }
  }),

  cancel: () => ({
    type: dialog_actions.CANCEL_DIALOG
  })
}
