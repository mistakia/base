// Markdown-it plugin for task checkboxes
// Based on: https://github.com/noootwo/markdown-it-task-checkbox-pro

export default function (md, options) {
  options = Object.assign(
    {
      disabled: true,
      idPrefix: 'task_',
      ulClass: 'task-list',
      liClass: 'task-list-item',
      nestedClass: 'nested-task-list',
      baseListClass: 'base-list-item'
    },
    options
  )

  // Plugin core
  md.core.ruler.after('inline', 'github-task-lists', function (state) {
    const tokens = state.tokens
    let last_id = 0

    // First pass: identify all lists and their nesting levels
    const list_info = new Map()
    let current_level = 0

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]

      if (token.type === 'bullet_list_open') {
        current_level++
        list_info.set(i, { nesting_level: current_level - 1 })
      } else if (token.type === 'bullet_list_close') {
        current_level = Math.max(0, current_level - 1)
      }
    }

    // Second pass: Process task items and set their nesting level
    for (let i = 2; i < tokens.length; i++) {
      if (is_todo_item(tokens, i)) {
        todoify(tokens[i], last_id, options, state.Token)
        last_id += 1

        // Set classes on the list item
        set_attr(tokens[i - 2], 'class', options.liClass)

        // Find parent list and set classes
        const parent_list_index = find_parent_token(tokens, i - 2)
        if (parent_list_index >= 0) {
          // Set base classes
          let class_list = `${options.ulClass} ${options.baseListClass}`

          // Get nesting level from our map
          const nesting_level = list_info.has(parent_list_index)
            ? list_info.get(parent_list_index).nesting_level
            : 0

          // Store nesting level as data attribute
          set_attr(
            tokens[i - 2],
            'data-nesting-level',
            nesting_level.toString()
          )

          // Mark parent ul if it's nested
          if (nesting_level > 0) {
            class_list += ` ${options.nestedClass}`
          }

          // Set all classes at once
          set_attr(tokens[parent_list_index], 'class', class_list)
        }
      }
    }
  })
}

function set_attr(token, name, value) {
  const index = token.attrIndex(name)
  const attr = [name, value]

  if (index < 0) {
    token.attrPush(attr)
  } else {
    token.attrs[index] = attr
  }
}

function find_parent_token(tokens, index) {
  const target_level = tokens[index].level - 1

  for (let i = index - 1; i >= 0; i--) {
    if (tokens[i].level === target_level) {
      return i
    }
  }
  return -1
}

function is_todo_item(tokens, index) {
  return (
    is_token_type(tokens[index], 'inline') &&
    is_token_type(tokens[index - 1], 'paragraph_open') &&
    is_token_type(tokens[index - 2], 'list_item_open') &&
    starts_with_todo_markdown(tokens[index])
  )
}

function todoify(token, last_id, options, TokenConstructor) {
  const id = options.idPrefix + last_id

  // Extract checkbox pattern from the content
  const match = /^\[([ xX])\][ \u00A0](.*)/.exec(token.content)
  if (!match) return

  const is_checked = /[xX]/.test(match[1])
  const original_content = match[2]

  // Create checkbox input with a data attribute for the text
  const checkbox = new TokenConstructor('html_inline', '', 0)
  checkbox.content = `<input type="checkbox" class="mui-checkbox" id="${id}"${is_checked ? ' checked' : ''}${options.disabled ? ' disabled' : ''} data-text="${original_content}">`

  // Replace token's children with our new tokens
  token.children = [checkbox]

  // Update the token content to just the checkbox
  token.content = checkbox.content
}

function is_token_type(token, type) {
  return token.type === type
}

function starts_with_todo_markdown(token) {
  // Check for '[ ] ' or '[x] ' or '[X] ' at the start of the content
  return /^\[[xX ]\][ \u00A0]/.test(token.content)
}
