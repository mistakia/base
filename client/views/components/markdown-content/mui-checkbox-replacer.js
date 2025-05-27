import React from 'react'
import { createRoot } from 'react-dom/client'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import { styled } from '@mui/material/styles'
import PropTypes from 'prop-types'

// Task item container with positioning
const TaskItemContainer = styled('div')(({ nestinglevel = 0 }) => ({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  marginLeft: nestinglevel > 0 ? `${nestinglevel * 12}px` : '0px',
  marginRight: '-8px'
}))

// Content container for checkbox and label
const TaskContent = styled('div')({
  position: 'relative',
  display: 'flex',
  alignItems: 'flex-start',
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

    // Process all task list items
    const task_list_items = element.querySelectorAll('li.task-list-item')
    const processed_items = new Set()

    task_list_items.forEach((item) => {
      if (processed_items.has(item)) return
      processed_items.add(item)

      // Get nesting level from data attribute
      const nesting_level = parseInt(
        item.getAttribute('data-nesting-level') || '0',
        10
      )

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

      // Find nested lists inside this item (if any)
      const nested_list = item.querySelector(':scope > ul.task-list')

      // Render the MUI checkbox with the extracted label
      const root = createRoot(container)
      react_roots.current.push(root)

      root.render(
        <TaskItemContainer nestinglevel={nesting_level}>
          <TaskContent className='task-list-item-content'>
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
                  color: 'inherit',
                  width: '100%'
                }
              }}
            />
          </TaskContent>
        </TaskItemContainer>
      )

      // Hide the original checkbox
      checkbox.style.display = 'none'

      // If this list item contains nested lists, restructure them
      if (nested_list) {
        // Add a class to indicate this is a parent with nested items
        item.classList.add('has-nested-items')

        // Ensure correct list styling for the nested items
        nested_list.classList.add('nested-task-list')
        nested_list.style.listStyleType = 'none'
        nested_list.style.marginLeft = '12px'
      }
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
