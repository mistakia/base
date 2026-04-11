import React from 'react'
import PropTypes from 'prop-types'

import './Toggle.styl'

const Toggle = ({ checked, on_change, label, id }) => {
  const handle_change = () => {
    on_change(!checked)
  }

  const class_names = ['toggle', checked && 'toggle--checked']
    .filter(Boolean)
    .join(' ')

  return (
    <label className={class_names} htmlFor={id}>
      <input
        id={id}
        type='checkbox'
        className='toggle__input'
        checked={checked}
        onChange={handle_change}
      />
      <div className='toggle__track'>
        <div className='toggle__thumb' />
      </div>
      {label && <span className='toggle__label'>{label}</span>}
    </label>
  )
}

Toggle.propTypes = {
  checked: PropTypes.bool.isRequired,
  on_change: PropTypes.func.isRequired,
  label: PropTypes.string,
  id: PropTypes.string
}

export default Toggle
