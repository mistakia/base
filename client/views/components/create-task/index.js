import { connect } from 'react-redux'

import { task_actions } from '@core/tasks'

import CreateTask from './create-task'

const mapDispatchToProps = {
  create_user_task: task_actions.create_user_task
}

export default connect(null, mapDispatchToProps)(CreateTask)
