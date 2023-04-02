import React from 'react'
import { Map } from 'immutable'
import ImmutablePropTypes from 'react-immutable-proptypes'
import PropTypes from 'prop-types'
import { useParams } from 'react-router-dom'
// import Grid from '@mui/material/Grid'
import Container from '@mui/material/Container'

import Table from '@components/table/table'
import CreateTask from '@components/create-task'

import './home.styl'

export default function HomePage({
  load_user,
  users,
  load_user_tasks,
  load_folder_path,
  selected_path_view,
  set_database_view_table_state
}) {
  const { username, user_folder_path } = useParams()

  React.useEffect(() => {
    load_user({ username })
  }, [])

  const user = users.get(username, new Map())
  const not_found = user.get('is_loaded') && !user.get('user_id')

  const on_table_change = (table_state) => {
    set_database_view_table_state({
      view_id: selected_path_view.view_id,
      table_state
    })
  }

  const user_id = user.get('user_id')
  React.useEffect(() => {
    if (user_id) {
      const folder_path = `/${user_id}/${user_folder_path || ''}`
      load_folder_path({ folder_path })
      load_user_tasks({ user_id })
    }
  }, [user_id])

  if (not_found) {
    return (
      <Container maxWidth='md' className='home__container'>
        <div>User [{username}] not found</div>
      </Container>
    )
  }

  const table_state = selected_path_view.get('table_state')

  // TODO: need to figure out data for database views
  return (
    <Container maxWidth='md' className='home__container'>
      <div>Username: {username}</div>
      {table_state && (
        <Table
          data={[]}
          on_table_change={on_table_change}
          table_state={table_state}
          all_columns={selected_path_view.get('all_table_columns')}
        />
      )}
      <CreateTask />
    </Container>
  )
}

HomePage.propTypes = {
  load_user: PropTypes.func,
  users: ImmutablePropTypes.map,
  load_user_tasks: PropTypes.func,
  load_folder_path: PropTypes.func,
  selected_path_view: ImmutablePropTypes.map,
  set_database_view_table_state: PropTypes.func
}
