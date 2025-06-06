import React from 'react'
import PropTypes from 'prop-types'
import LinearProgress from '@mui/material/LinearProgress'
import Box from '@mui/material/Box'
import useMediaQuery from '@mui/material/useMediaQuery'

import Dialog from '@components/dialog'
import Routes from '@views/routes'
import Menu from '@components/menu'
// import FloatingThreadForm from '@components/thread/floating-thread-form'

import '@styles/normalize.css'
import '@styles/typography.styl'
import '@styles/layout.styl'

import './app.styl'

export default function App(props) {
  const { load, is_loaded, username } = props
  const is_desktop = useMediaQuery('(min-width:900px)')
  const [drawer_open, set_drawer_open] = React.useState(is_desktop)

  React.useEffect(() => {
    load()
  }, [load])

  React.useEffect(() => {
    set_drawer_open(is_desktop)
  }, [is_desktop])

  if (!is_loaded) {
    return (
      <div className='load__container'>
        <Box sx={{ width: '100px', paddingTop: '2em' }}>
          <LinearProgress color='inherit' />
        </Box>
      </div>
    )
  }

  return (
    <div className='app__container'>
      <Menu
        username={username}
        drawer_open={drawer_open}
        set_drawer_open={set_drawer_open}
        is_desktop={is_desktop}
      />
      <div
        className={`app__main${drawer_open ? ' app__main--drawer-open' : ' app__main--drawer-closed'}`}>
        <Routes />
        <Dialog />
        {/* <div className='thread-form-wrapper'>
          <FloatingThreadForm />
        </div> */}
      </div>
    </div>
  )
}

App.propTypes = {
  load: PropTypes.func,
  is_loaded: PropTypes.bool,
  username: PropTypes.string
}
