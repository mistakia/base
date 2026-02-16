import React, { useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { Provider, useSelector, useDispatch } from 'react-redux'
import { HistoryRouter as Router } from 'redux-first-history/rr6'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import { CircularProgress, Box } from '@mui/material'

import { store, history } from '@core/store.js'
import StoreRegistry from '@core/store-registry.js'
import { app_actions } from '@core/app/actions'
import { get_app, get_can_create_threads } from '@core/app/selectors'
import { thread_prompt_actions } from '@core/thread-prompt/index.js'
import {
  search_actions,
  get_is_command_palette_open
} from '@core/search/index.js'
import Routes from './routes.js'
import DialogContainer from '@components/DialogContainer'
import Notification from '@components/Notification'
import GlobalThreadInput from '@components/GlobalThreadInput'
import FloatingSessionsPanel from '@components/FloatingSessionsPanel/FloatingSessionsPanel.js'
import CommandPalette from '@components/CommandPalette'
import { get_notification_info } from '@core/notification/selectors'

// Import styles
import '@styles/normalize.css'
import '@styles/typography.styl'
import '@styles/pages.styl'
import '@styles/utilities.styl'
import '@styles/components/buttons.styl'
import '@styles/print.styl'

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

// UUID pattern for thread ID detection
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Parse thread ID from path if on a thread page
const parse_thread_from_path = (path) => {
  if (!path.startsWith('/thread/')) {
    return null
  }
  const parts = path.split('/')
  const thread_id = parts[2]
  if (!thread_id || !UUID_PATTERN.test(thread_id)) {
    return null
  }
  return thread_id
}

const ThreadPromptContainer = () => {
  const dispatch = useDispatch()
  const is_open = useSelector((state) =>
    state.getIn(['thread_prompt', 'is_open'], false)
  )
  const directory_state = useSelector((state) => state.get('directory'))
  const router = useSelector((state) => state.get('router'))
  const selected_thread_data = useSelector((state) =>
    state.getIn(['threads', 'selected_thread_data'])
  )
  const can_create_threads = useSelector(get_can_create_threads)

  // Use refs for values accessed in keydown handler to avoid stale closures
  const is_open_ref = useRef(is_open)
  const current_path_ref = useRef(router?.location?.pathname || '/')
  const path_info_ref = useRef(directory_state?.get('path_info'))
  const selected_thread_data_ref = useRef(selected_thread_data)
  const can_create_threads_ref = useRef(can_create_threads)

  // Keep refs in sync with state
  useEffect(() => {
    is_open_ref.current = is_open
  }, [is_open])

  useEffect(() => {
    current_path_ref.current = router?.location?.pathname || '/'
  }, [router])

  useEffect(() => {
    path_info_ref.current = directory_state?.get('path_info')
  }, [directory_state])

  useEffect(() => {
    selected_thread_data_ref.current = selected_thread_data
  }, [selected_thread_data])

  useEffect(() => {
    can_create_threads_ref.current = can_create_threads
  }, [can_create_threads])

  // Auto-open thread prompt when navigating to /thread/new (mobile/Action Button entry point)
  useEffect(() => {
    const current_path = router?.location?.pathname
    if (current_path === '/thread/new' && !is_open && can_create_threads) {
      dispatch(
        thread_prompt_actions.open({
          thread_id: null,
          thread_user_public_key: null,
          file_path: null,
          current_path
        })
      )
    }
  }, [router?.location?.pathname, dispatch, can_create_threads])

  useEffect(() => {
    const handle_keydown = (event) => {
      // Cmd/Ctrl+K to toggle thread prompt overlay
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        if (is_open_ref.current) {
          dispatch(thread_prompt_actions.close())
        } else if (can_create_threads_ref.current) {
          // Capture context at open time using current ref values
          const current_path = current_path_ref.current
          const path_info = path_info_ref.current
          const thread_id = parse_thread_from_path(current_path)
          const is_file_page = !thread_id && path_info?.type === 'file'

          // Capture thread ownership for resume permission check
          const thread_data = selected_thread_data_ref.current
          const thread_user_public_key =
            thread_id && thread_data?.get('thread_id') === thread_id
              ? thread_data.get('user_public_key')
              : null

          dispatch(
            thread_prompt_actions.open({
              thread_id,
              thread_user_public_key,
              file_path: is_file_page
                ? current_path.startsWith('/')
                  ? current_path.slice(1)
                  : current_path
                : null,
              current_path
            })
          )
        }
      }
    }

    document.addEventListener('keydown', handle_keydown)
    return () => document.removeEventListener('keydown', handle_keydown)
  }, [dispatch])

  return <GlobalThreadInput />
}

const SearchPaletteContainer = () => {
  const dispatch = useDispatch()
  const is_open = useSelector(get_is_command_palette_open)

  useEffect(() => {
    const handle_keydown = (event) => {
      // Cmd/Ctrl+Shift+P to toggle command palette
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key === 'p'
      ) {
        event.preventDefault()
        if (is_open) {
          dispatch(search_actions.close())
        } else {
          dispatch(search_actions.open())
        }
      }
    }

    document.addEventListener('keydown', handle_keydown)
    return () => document.removeEventListener('keydown', handle_keydown)
  }, [dispatch, is_open])

  return <CommandPalette />
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
            <FloatingSessionsPanel />
            <SearchPaletteContainer />
          </AppInitializer>
        </ThemeProvider>
      </Router>
    </Provider>
  )
}

export default Root
