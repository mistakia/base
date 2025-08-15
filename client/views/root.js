import React, { useEffect } from 'react'
import PropTypes from 'prop-types'
import { Provider, useSelector } from 'react-redux'
import { HistoryRouter as Router } from 'redux-first-history/rr6'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import { CircularProgress, Box } from '@mui/material'

import { store, history } from '@core/store.js'
import StoreRegistry from '@core/store-registry.js'
import { app_actions } from '@core/app/actions'
import { get_app } from '@core/app/selectors'
import Routes from './routes.js'

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

const Root = () => {
  return (
    <Provider store={store}>
      <Router history={history}>
        <ThemeProvider theme={theme}>
          <AppInitializer>
            <Routes />
          </AppInitializer>
        </ThemeProvider>
      </Router>
    </Provider>
  )
}

export default Root
