import React, { useEffect } from 'react'
import PropTypes from 'prop-types'
import { useLocation, useNavigate } from 'react-router-dom'
import { Drawer } from 'vaul'
import Fab from '@mui/material/Fab'
import MenuIcon from '@mui/icons-material/Menu'
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined'
import FormatListBulletedOutlinedIcon from '@mui/icons-material/FormatListBulletedOutlined'
import MemoryOutlinedIcon from '@mui/icons-material/MemoryOutlined'

import './menu.styl'

const Menu = ({ username, drawer_open, set_drawer_open, is_desktop }) => {
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

  const render_menu = () => (
    <ul className='menu__list'>
      {menu_items.map(({ label, path, icon }) => (
        <li
          key={path}
          className={`menu__item${location.pathname.startsWith(path) ? ' menu__item--active' : ''}`}
          onClick={() => handle_navigate(path)}>
          {icon && (
            <span
              style={{ display: 'flex', alignItems: 'center', marginRight: 8 }}>
              {icon}
            </span>
          )}
          {label}
        </li>
      ))}
    </ul>
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
  is_desktop: PropTypes.bool.isRequired
}

export default Menu
