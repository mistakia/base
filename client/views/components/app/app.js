import React from 'react'
import PropTypes from 'prop-types'
import LinearProgress from '@mui/material/LinearProgress'
import Box from '@mui/material/Box'

import Dialog from '@components/dialog'
import Routes from '@views/routes'

import '@styles/normalize.css'
import '@styles/typography.styl'

import './app.styl'

export default class App extends React.Component {
  async componentDidMount() {
    this.props.load()
  }

  render() {
    const { is_loaded } = this.props
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
      <>
        <Routes />
        <Dialog />
      </>
    )
  }
}

App.propTypes = {
  load: PropTypes.func,
  is_loaded: PropTypes.bool
}
