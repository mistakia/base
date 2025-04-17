// Markdown-it plugin for task checkboxes
// Based on: https://github.com/noootwo/markdown-it-task-checkbox-pro

export default function (md, options) {
  options = Object.assign(
    {
      disabled: true,
      divWrap: false,
      divClass: 'checkbox',
      idPrefix: 'task_',
      ulClass: 'task-list',
      liClass: 'task-list-item'
    },
    options
  )

  // Plugin core
  md.core.ruler.after('inline', 'github-task-lists', function (state) {
    const tokens = state.tokens
    let lastId = 0

    for (let i = 2; i < tokens.length; i++) {
      if (isTodoItem(tokens, i)) {
        todoify(tokens[i], lastId, options, state.Token)
        lastId += 1
        attrSet(tokens[i - 2], 'class', options.liClass)
        attrSet(tokens[parentToken(tokens, i - 2)], 'class', options.ulClass)
      }
    }
  })
}

function attrSet(token, name, value) {
  const index = token.attrIndex(name)
  const attr = [name, value]
  if (index < 0) {
    token.attrPush(attr)
  } else {
    token.attrs[index] = attr
  }
}

function parentToken(tokens, index) {
  const targetLevel = tokens[index].level - 1
  for (let i = index - 1; i >= 0; i--) {
    if (tokens[i].level === targetLevel) {
      return i
    }
  }
  return -1
}

function isTodoItem(tokens, index) {
  return (
    isInline(tokens[index]) &&
    isParagraph(tokens[index - 1]) &&
    isListItem(tokens[index - 2]) &&
    startsWithTodoMarkdown(tokens[index])
  )
}

function todoify(token, lastId, options, TokenConstructor) {
  const id = options.idPrefix + lastId

  // Extract checkbox pattern from the content
  const match = /^\[([ xX])\][ \u00A0](.*)/.exec(token.content)
  if (!match) return

  const isChecked = /[xX]/.test(match[1])

  // Create checkbox input with a data attribute for the text
  const checkbox = new TokenConstructor('html_inline', '', 0)
  const originalContent = match[2]
  checkbox.content = `<input type="checkbox" class="mui-checkbox" id="${id}"${isChecked ? ' checked' : ''}${options.disabled ? ' disabled' : ''} data-text="${originalContent}">`

  // Replace token's children with our new tokens
  if (token.children && token.children.length) {
    // Keep only the checkbox element, remove text from content
    token.children = [checkbox]
  } else {
    // No children, set our own
    token.children = [checkbox]
  }

  // Update the token content to just the checkbox
  token.content = checkbox.content
}

function isInline(token) {
  return token.type === 'inline'
}

function isParagraph(token) {
  return token.type === 'paragraph_open'
}

function isListItem(token) {
  return token.type === 'list_item_open'
}

function startsWithTodoMarkdown(token) {
  // Check for '[ ] ' or '[x] ' or '[X] ' at the start of the content
  return /^\[[xX ]\][ \u00A0]/.test(token.content)
}
