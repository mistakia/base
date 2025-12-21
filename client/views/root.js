import React, { useEffect } from 'react'
import PropTypes from 'prop-types'
import { Provider, useSelector, useDispatch } from 'react-redux'
import { HistoryRouter as Router } from 'redux-first-history/rr6'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import { CircularProgress, Box } from '@mui/material'

import { store, history } from '@core/store.js'
import StoreRegistry from '@core/store-registry.js'
import { app_actions } from '@core/app/actions'
import { get_app } from '@core/app/selectors'
import { thread_prompt_actions } from '@core/thread-prompt/index.js'
import Routes from './routes.js'
import DialogContainer from '@components/DialogContainer'
import Notification from '@components/Notification'
import GlobalThreadInput from '@components/GlobalThreadInput'
import { get_notification_info } from '@core/notification/selectors'

// Import styles
import '@styles/normalize.css'
import '@styles/typography.styl'
import '@styles/pages.styl'
import '@styles/utilities.styl'

StoreRegistry.register(store)

const theme = createTheme({
  palette: {
    primary: {
      main: '#007bff'
    },
    secondary: {
      main: '#007bff'
    },
    error: {
      main: '#d73a49'
    },
    success: {
      main: '#28a745'
    },
    warning: {
      main: '#f66a0a'
    },
    info: {
      main: '#0969da'
    }
  },
  typography: {
    fontFamily: '"IBM Plex Mono", "Monaco", "Menlo", "Ubuntu Mono", monospace',
    fontSize: 14, // matches --font-size-base
    h1: { fontSize: 18 },
    h2: { fontSize: 18 },
    h3: { fontSize: 14 },
    h4: { fontSize: 14 },
    h5: { fontSize: 12 },
    h6: { fontSize: 11 },
    body1: { fontSize: 14 },
    body2: { fontSize: 12 },
    caption: { fontSize: 11 }
  },
  spacing: 8, // Aligns with design system 8px grid
  shape: {
    borderRadius: 4 // matches --radius-base
  }
})

const AppInitializer = ({ children }) => {
  const app_state = useSelector(get_app)
  const is_loaded = app_state.get('is_loaded')

  useEffect(() => {
    store.dispatch(app_actions.load())
  }, [])

  if (!is_loaded) {
    return (
      <Box
        display='flex'
        justifyContent='center'
        alignItems='center'
        minHeight='100vh'>
        <CircularProgress />
      </Box>
    )
  }

  return children
}

AppInitializer.propTypes = {
  children: PropTypes.node.isRequired
}

const NotificationContainer = () => {
  const notification_info = useSelector(get_notification_info)
  return <Notification info={notification_info} />
}

const ThreadPromptContainer = () => {
  const dispatch = useDispatch()
  const is_open = useSelector((state) =>
    state.getIn(['thread_prompt', 'is_open'], false)
  )

  useEffect(() => {
    const handle_keydown = (event) => {
      // Cmd/Ctrl+K to toggle thread prompt overlay
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        if (is_open) {
          dispatch(thread_prompt_actions.close())
        } else {
          dispatch(thread_prompt_actions.open())
        }
      }
    }

    document.addEventListener('keydown', handle_keydown)
    return () => document.removeEventListener('keydown', handle_keydown)
  }, [dispatch, is_open])

  return <GlobalThreadInput />
}

const Root = () => {
  return (
    <Provider store={store}>
      <Router history={history}>
        <ThemeProvider theme={theme}>
          <AppInitializer>
            <Routes />
            <DialogContainer />
            <NotificationContainer />
            <ThreadPromptContainer />
          </AppInitializer>
        </ThemeProvider>
      </Router>
    </Provider>
  )
}

export default Root
