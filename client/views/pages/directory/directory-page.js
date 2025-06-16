import React, { useEffect } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { connect } from 'react-redux'
import PropTypes from 'prop-types'
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined'
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined'

import { directories_actions } from '@core/directory'

import './directory-page.styl'

const DirectoryPage = ({ directories_state, load_directories }) => {
  const { type } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  // Extract the path after '/directory/:type/'
  const directory_path =
    location.pathname.replace(`/directory/${type}/`, '') || ''

  useEffect(() => {
    if (type) {
      load_directories({ type, path: directory_path })
    }
  }, [type, directory_path, load_directories])

  const cache_key = `${type}:${directory_path}`
  const directory_state = directories_state.getIn([
    'directories_state',
    cache_key
  ])

  const directories = directory_state ? directory_state.directories : []
  const files = directory_state ? directory_state.files : []
  const loading = directory_state ? directory_state.loading : true
  const error = directory_state ? directory_state.error : null

  const get_breadcrumb_path = () => {
    if (!directory_path) return type
    return `${type} / ${directory_path.split('/').join(' / ')}`
  }

  const handle_directory_click = (directory) => {
    const new_path = directory_path
      ? `${directory_path}/${directory.name}`
      : directory.name
    navigate(`/directory/${type}/${new_path}`)
  }

  const handle_file_click = (file) => {
    const file_path = directory_path
      ? `${directory_path}/${file.name}`
      : file.name
    navigate(`/file/${type}/${file_path}`)
  }

  if (loading) {
    return (
      <div className='directory-page'>
        <div className='directory-page__loading'>Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className='directory-page'>
        <div className='directory-page__error'>{error}</div>
      </div>
    )
  }

  return (
    <div className='directory-page'>
      <div className='directory-page__header'>
        <h1 className='directory-page__title'>{get_breadcrumb_path()}</h1>
        <div className='directory-page__summary'>
          {directories.length} directories, {files.length} files
        </div>
      </div>

      <div className='directory-page__content'>
        {directories.length > 0 && (
          <div className='directory-page__section'>
            <h2 className='directory-page__section-title'>Directories</h2>
            <div className='directory-page__grid'>
              {directories.map((directory) => (
                <div
                  key={directory.path}
                  className='directory-page__item directory-page__item--directory'
                  onClick={() => handle_directory_click(directory)}>
                  <FolderOutlinedIcon className='directory-page__item-icon' />
                  <span className='directory-page__item-name'>
                    {directory.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {files.length > 0 && (
          <div className='directory-page__section'>
            <h2 className='directory-page__section-title'>Files</h2>
            <div className='directory-page__grid'>
              {files.map((file) => (
                <div
                  key={file.path}
                  className='directory-page__item directory-page__item--file'
                  onClick={() => handle_file_click(file)}>
                  <InsertDriveFileOutlinedIcon className='directory-page__item-icon' />
                  <span className='directory-page__item-name'>{file.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {directories.length === 0 && files.length === 0 && (
          <div className='directory-page__empty'>This directory is empty</div>
        )}
      </div>
    </div>
  )
}

DirectoryPage.propTypes = {
  directories_state: PropTypes.object,
  load_directories: PropTypes.func.isRequired
}

const map_state_to_props = (state) => ({
  directories_state: state.get('directory')
})

const map_dispatch_to_props = {
  load_directories: directories_actions.load_directories
}

export default connect(map_state_to_props, map_dispatch_to_props)(DirectoryPage)
