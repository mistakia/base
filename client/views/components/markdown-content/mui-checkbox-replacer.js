import React from 'react'
import { createRoot } from 'react-dom/client'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import { styled } from '@mui/material/styles'
import PropTypes from 'prop-types'

// Styled wrapper for the MUI checkbox
const CheckboxWrapper = styled('div')({
  display: 'flex',
  alignItems: 'flex-start',
  margin: 0,
  padding: 0,
  width: '100%'
})

// Create a MUI checkbox component with proper styling
const TaskCheckbox = ({ checked, disabled }) => {
  return (
    <Checkbox
      checked={checked}
      disabled={disabled}
      size='small'
      sx={{
        padding: '0 8px 0 0',
        '&.Mui-checked': {
          color: 'primary.main'
        },
        '&.Mui-disabled': {
          color: 'text.disabled'
        }
      }}
    />
  )
}

TaskCheckbox.propTypes = {
  checked: PropTypes.bool,
  disabled: PropTypes.bool
}

// Main component that replaces HTML checkboxes with MUI ones
export default function MuiCheckboxReplacer({ element }) {
  // Store all React roots so we can unmount them on cleanup
  const react_roots = React.useRef([])

  React.useEffect(() => {
    if (!element) return

    // Find all task list items
    const task_list_items = element.querySelectorAll('li.task-list-item')

    task_list_items.forEach((item) => {
      // Find the checkbox within this list item
      const checkbox = item.querySelector('input.mui-checkbox')
      if (!checkbox) return

      // Get checkbox properties
      const checkbox_checked = checkbox.checked
      const checkbox_disabled = checkbox.disabled
      const label_text = checkbox.getAttribute('data-text') || ''

      // Create a container for our React component
      const container = document.createElement('div')
      container.className = 'mui-checkbox-wrapper'

      // Insert the container at the beginning of the list item
      item.insertBefore(container, item.firstChild)

      // Render the MUI checkbox with the extracted label
      const root = createRoot(container)
      react_roots.current.push(root)

      root.render(
        <CheckboxWrapper>
          <FormControlLabel
            control={
              <TaskCheckbox
                checked={checkbox_checked}
                disabled={checkbox_disabled}
              />
            }
            label={label_text}
            sx={{
              margin: 0,
              '.MuiFormControlLabel-label': {
                fontFamily: 'inherit',
                fontSize: 'inherit',
                lineHeight: 'inherit',
                color: 'inherit'
              }
            }}
          />
        </CheckboxWrapper>
      )

      // Hide the original checkbox
      checkbox.style.display = 'none'
    })

    // Cleanup function to unmount all React roots
    return () => {
      react_roots.current.forEach((root) => {
        try {
          root.unmount()
        } catch (e) {
          console.error('Error unmounting React root:', e)
        }
      })
      react_roots.current = []
    }
  }, [element])

  return null
}

MuiCheckboxReplacer.propTypes = {
  element: PropTypes.object.isRequired
}
