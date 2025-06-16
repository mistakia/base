import React, { useEffect } from 'react'
import PropTypes from 'prop-types'
import { useLocation, useNavigate } from 'react-router-dom'
import { Drawer } from 'vaul'
import Fab from '@mui/material/Fab'
import MenuIcon from '@mui/icons-material/Menu'
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined'
import FormatListBulletedOutlinedIcon from '@mui/icons-material/FormatListBulletedOutlined'
import MemoryOutlinedIcon from '@mui/icons-material/MemoryOutlined'
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'

import './menu.styl'

const Menu = ({
  username,
  drawer_open,
  set_drawer_open,
  is_desktop,
  user_directories,
  system_directories,
  expanded_directories,
  load_directories,
  toggle_directory,
  get_directory_state_fn
}) => {
  const location = useLocation()
  const navigate = useNavigate()

  const menu_items = [
    {
      label: 'Home',
      path: `/${username}`,
      icon: (
        <HomeOutlinedIcon
          style={{
            marginRight: 8,
            color: 'rgb(145, 145, 142)',
            width: 20,
            height: 20
          }}
        />
      )
    },
    {
      label: 'Tasks',
      path: '/tasks',
      icon: (
        <FormatListBulletedOutlinedIcon
          style={{
            marginRight: 8,
            color: 'rgb(145, 145, 142)',
            width: 20,
            height: 20
          }}
        />
      )
    },
    {
      label: 'Threads',
      path: '/threads',
      icon: (
        <MemoryOutlinedIcon
          style={{
            marginRight: 8,
            color: 'rgb(145, 145, 142)',
            width: 20,
            height: 20
          }}
        />
      )
    }
    // Add more items as needed
  ]

  useEffect(() => {
    // Load root directories for both user and system
    load_directories({ type: 'user', path: '' })
    load_directories({ type: 'system', path: '' })
  }, [load_directories])

  const handle_toggle_directory = (type, directory_path) => {
    toggle_directory({ type, path: directory_path })
  }

  const handle_navigate = (path) => {
    navigate(path)
    if (!is_desktop) {
      set_drawer_open(false)
    }
  }

  useEffect(() => {
    if (!drawer_open) return

    const original_pointer_events = document.body.style.pointerEvents
    const raf = window.requestAnimationFrame(() => {
      document.body.style.pointerEvents = 'auto'
    })

    return () => {
      window.cancelAnimationFrame(raf)
      document.body.style.pointerEvents = original_pointer_events
    }
  }, [drawer_open])

  const render_directory_item = (directory, type, level = 0) => {
    const cache_key = `${type}:${directory.path}`
    const is_expanded = expanded_directories.has(cache_key)
    const cached_content = get_directory_state_fn(type, directory.path)
    // Use the has_subdirectories field from the API, or check cached content
    const has_subdirectories =
      directory.has_subdirectories !== undefined
        ? directory.has_subdirectories
        : cached_content && cached_content.directories
          ? cached_content.directories.length > 0
          : false

    return (
      <li
        key={`${type}-${directory.path}`}
        className='menu__directory-container'>
        <div
          className='menu__directory-item'
          style={{ paddingLeft: `${8 + level * 16}px` }}>
          <button
            className={`menu__expand-button ${has_subdirectories ? '' : 'menu__expand-button--hidden'}`}
            onClick={(e) => {
              e.stopPropagation()
              handle_toggle_directory(type, directory.path)
            }}
            disabled={!has_subdirectories}>
            {is_expanded ? (
              <ExpandMoreIcon style={{ width: 16, height: 16 }} />
            ) : (
              <ChevronRightIcon style={{ width: 16, height: 16 }} />
            )}
          </button>
          <div
            className='menu__directory-content'
            onClick={() =>
              handle_navigate(`/directory/${type}/${directory.path}`)
            }>
            <FolderOutlinedIcon
              style={{
                marginRight: 8,
                color: 'rgb(145, 145, 142)',
                width: 16,
                height: 16
              }}
            />
            {directory.name}
          </div>
        </div>
        {is_expanded && cached_content && cached_content.directories && (
          <ul className='menu__subdirectory-list'>
            {cached_content.directories.map((subdir) =>
              render_directory_item(subdir, type, level + 1)
            )}
          </ul>
        )}
      </li>
    )
  }

  const render_menu = () => (
    <div className='menu__content'>
      <ul className='menu__list'>
        {menu_items.map(({ label, path, icon }) => (
          <li
            key={path}
            className={`menu__item${location.pathname.startsWith(path) ? ' menu__item--active' : ''}`}
            onClick={() => handle_navigate(path)}>
            {icon && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginRight: 8
                }}>
                {icon}
              </span>
            )}
            {label}
          </li>
        ))}
      </ul>

      {user_directories && user_directories.length > 0 && (
        <div className='menu__section'>
          <div className='menu__section-header'>User Directories</div>
          <ul className='menu__directory-list'>
            {user_directories.map((directory) =>
              render_directory_item(directory, 'user')
            )}
          </ul>
        </div>
      )}

      {system_directories && system_directories.length > 0 && (
        <div className='menu__section'>
          <div className='menu__section-header'>System Directories</div>
          <ul className='menu__directory-list'>
            {system_directories.map((directory) =>
              render_directory_item(directory, 'system')
            )}
          </ul>
        </div>
      )}
    </div>
  )

  return (
    <>
      <Fab
        aria-label='open menu'
        className='menu__floating-btn'
        onClick={() => set_drawer_open(!drawer_open)}
        sx={{ position: 'fixed', bottom: 16, right: 16 }}>
        <MenuIcon />
      </Fab>
      <Drawer.Root
        open={drawer_open}
        direction='left'
        modal={false}
        defaultOpen={is_desktop}>
        <Drawer.Portal>
          <Drawer.Content
            className='menu__sidebar'
            style={{ minHeight: '100vh' }}>
            {render_menu()}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  )
}

Menu.propTypes = {
  username: PropTypes.string.isRequired,
  drawer_open: PropTypes.bool.isRequired,
  set_drawer_open: PropTypes.func.isRequired,
  is_desktop: PropTypes.bool.isRequired,
  user_directories: PropTypes.array,
  system_directories: PropTypes.array,
  expanded_directories: PropTypes.object,
  load_directories: PropTypes.func.isRequired,
  toggle_directory: PropTypes.func.isRequired,
  get_directory_state_fn: PropTypes.func.isRequired
}

export default Menu
