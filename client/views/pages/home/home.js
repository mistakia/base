import React from 'react'
import { Map } from 'immutable'
import ImmutablePropTypes from 'react-immutable-proptypes'
import PropTypes from 'prop-types'
import { useParams } from 'react-router-dom'
// import Grid from '@mui/material/Grid'
import Container from '@mui/material/Container'

import Table from '/Users/trashman/Projects/react-table/index.js'
import CreateTask from '@components/create-task'

import './home.styl'

export default function HomePage({
  load_user,
  users,
  load_folder_path,
  load_database,
  set_selected_path,
  selected_path_view,
  selected_path_views,
  set_database_view_table_state,
  database_table_items
}) {
  const { username, user_folder_path, database_table_name } = useParams()

  React.useEffect(() => {
    load_user({ username })
  }, [])

  React.useEffect(() => {
    set_selected_path({ username, user_folder_path, database_table_name })
  }, [username, user_folder_path, database_table_name])

  const user = users.get(username, new Map())
  const user_id = user.get('user_id')
  React.useEffect(() => {
    if (user_id) {
      set_selected_path({
        user_id,
        username,
        user_folder_path,
        database_table_name
      })
      if (database_table_name) {
        load_database({ user_id, database_table_name })
      } else {
        const folder_path = `/${user_id}/${user_folder_path || ''}`
        load_folder_path({ folder_path })
      }
    }
  }, [user_id])

  const on_table_change = (table_state) => {
    set_database_view_table_state({
      view_id: selected_path_view.get('view_id'),
      table_state
    })
  }

  const not_found = user.get('is_loaded') && !user.get('user_id')
  if (not_found) {
    return (
      <Container maxWidth='md' className='home__container'>
        <div>User [{username}] not found</div>
      </Container>
    )
  }

  const table_state = selected_path_view.get('table_state')

  return (
    <Container maxWidth='md' className='home__container'>
      <div>Username: {username}</div>
      {table_state && (
        <Table
          data={database_table_items.toJS()}
          on_table_change={on_table_change}
          table_state={table_state}
          all_columns={selected_path_view.get('all_columns')}
          selected_view={selected_path_view}
          select_view={(view) => {
            console.log('select_view', view) // TODO: select view
          }}
          views={selected_path_views.toList()}
        />
      )}
      <CreateTask />
    </Container>
  )
}

HomePage.propTypes = {
  load_user: PropTypes.func,
  load_database: PropTypes.func,
  users: ImmutablePropTypes.map,
  load_folder_path: PropTypes.func,
  selected_path_view: ImmutablePropTypes.map,
  selected_path_views: ImmutablePropTypes.map,
  set_selected_path: PropTypes.func,
  set_database_view_table_state: PropTypes.func,
  database_table_items: ImmutablePropTypes.list
}
