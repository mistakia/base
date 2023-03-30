import React from 'react'
import PropTypes from 'prop-types'
// import Grid from '@mui/material/Grid'
import Container from '@mui/material/Container'

import './home.styl'

export default class HomePage extends React.Component {
  render() {
    const { is_loaded } = this.props
    return (
      <Container maxWidth='md' className='home__container'>
        Loaded: {is_loaded.toString()}
      </Container>
    )
  }
}

HomePage.propTypes = {
  is_loaded: PropTypes.bool
}
