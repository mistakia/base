import React from 'react'
import { Map } from 'immutable'
import ImmutablePropTypes from 'react-immutable-proptypes'
import PropTypes from 'prop-types'
import { useParams } from 'react-router-dom'
// import Grid from '@mui/material/Grid'

import Table from '../../../../../react-table/index.js'
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
  set_database_view,
  database_table_items,
  table_state,
  all_columns,
  set_selected_path_view_id,
  delete_database_view
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

  const not_found = user.get('is_loaded') && !user.get('user_id')
  if (not_found) {
    return (
      <div className='home-container'>
        <div>User [{username}] not found</div>
      </div>
    )
  }

  return (
    <div className='home-container'>
      {table_state && (
        <Table
          data={database_table_items}
          on_view_change={set_database_view}
          table_state={table_state}
          all_columns={all_columns}
          selected_view={selected_path_view}
          select_view={set_selected_path_view_id}
          views={selected_path_views}
          delete_view={delete_database_view}
        />
      )}
      <CreateTask />
    </div>
  )
}

HomePage.propTypes = {
  load_user: PropTypes.func,
  load_database: PropTypes.func,
  users: ImmutablePropTypes.map,
  load_folder_path: PropTypes.func,
  selected_path_view: PropTypes.object,
  selected_path_views: PropTypes.array,
  set_selected_path: PropTypes.func,
  set_database_view: PropTypes.func,
  database_table_items: PropTypes.array,
  table_state: PropTypes.object,
  all_columns: PropTypes.object,
  set_selected_path_view_id: PropTypes.func,
  delete_database_view: PropTypes.func
}
