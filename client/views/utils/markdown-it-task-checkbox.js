// Markdown-it plugin for task checkboxes
// Based on: https://github.com/noootwo/markdown-it-task-checkbox-pro

export default function markdown_it_task_checkbox(md, options = {}) {
  const { ul_class, li_class, nested_class } = normalize_options({ options })

  md.core.ruler.after('inline', 'github-task-lists', function (state) {
    const token_list = state.tokens

    const list_open_index_to_level = new Map()
    let current_list_level = 0

    for (let index = 0; index < token_list.length; index++) {
      const token = token_list[index]
      if (token.type === 'bullet_list_open') {
        list_open_index_to_level.set(index, current_list_level)
        current_list_level++
      } else if (token.type === 'bullet_list_close') {
        current_list_level = Math.max(0, current_list_level - 1)
      }
    }

    for (let index = 2; index < token_list.length; index++) {
      if (is_task_list_item({ token_list, index })) {
        convert_to_task_item({
          token: token_list[index],
          TokenConstructor: state.Token,
          md: md,
          env: state.env
        })

        set_attribute({
          token: token_list[index - 2],
          name: 'class',
          value: li_class
        })

        const parent_list_index = find_parent_token_index({
          token_list,
          target_index: index - 2
        })
        if (parent_list_index >= 0) {
          let parent_class_list = `${ul_class}`

          const nesting_level = list_open_index_to_level.has(parent_list_index)
            ? list_open_index_to_level.get(parent_list_index)
            : 0

          set_attribute({
            token: token_list[index - 2],
            name: 'data-nesting-level',
            value: nesting_level.toString()
          })

          if (nesting_level > 0) {
            parent_class_list += ` ${nested_class}`
          }

          set_attribute({
            token: token_list[parent_list_index],
            name: 'class',
            value: parent_class_list
          })
        }
      }
    }
  })
}

function normalize_options({ options }) {
  const default_ul_class = 'checkbox-list'
  const default_li_class = 'checkbox-list-item'
  const default_nested_class = 'nested-checkbox-list'

  if (!options) {
    return {
      ul_class: default_ul_class,
      li_class: default_li_class,
      nested_class: default_nested_class
    }
  }

  const ul_class = options.ul_class ?? options.ulClass ?? default_ul_class
  const li_class = options.li_class ?? options.liClass ?? default_li_class
  const nested_class =
    options.nested_class ?? options.nestedClass ?? default_nested_class

  return { ul_class, li_class, nested_class }
}

function set_attribute({ token, name, value }) {
  const attr_index = token.attrIndex(name)
  const attribute = [name, value]
  if (attr_index < 0) {
    token.attrPush(attribute)
  } else {
    token.attrs[attr_index] = attribute
  }
}

function find_parent_token_index({ token_list, target_index }) {
  const target_level = token_list[target_index].level - 1
  for (let index = target_index - 1; index >= 0; index--) {
    if (token_list[index].level === target_level) return index
  }
  return -1
}

function is_task_list_item({ token_list, index }) {
  return (
    is_token_type({ token: token_list[index], type: 'inline' }) &&
    is_token_type({ token: token_list[index - 1], type: 'paragraph_open' }) &&
    is_token_type({ token: token_list[index - 2], type: 'list_item_open' }) &&
    starts_with_task_markdown({ token: token_list[index] })
  )
}

function convert_to_task_item({ token, TokenConstructor, md, env }) {
  const checkbox_match = /^\[([ xX])\][ \u00A0](.*)/.exec(token.content)
  if (!checkbox_match) return

  const is_checked = /[xX]/.test(checkbox_match[1])
  const label_text = checkbox_match[2]

  const container_open = new TokenConstructor('html_inline', '', 0)
  container_open.content =
    '<div class="checkbox-item" data-task-status="' +
    (is_checked ? 'completed' : 'pending') +
    '">'

  const checkbox_html = new TokenConstructor('html_inline', '', 0)
  checkbox_html.content = `<span class="checkbox-box" data-checkbox-status="${is_checked ? 'completed' : 'pending'}"></span>`

  // Create a temporary token to process the label text through markdown-it inline parsing
  const temp_token = new TokenConstructor('inline', '', 0)
  temp_token.content = label_text
  temp_token.children = []
  
  // Process inline markdown in the label text
  md.inline.parse(label_text, md, env, temp_token.children)
  
  // Render the processed tokens to HTML
  const rendered_label = md.renderer.render(temp_token.children, md.options, env)

  const label_html = new TokenConstructor('html_inline', '', 0)
  label_html.content = `<span class="checkbox-text">${rendered_label}</span>`

  const container_close = new TokenConstructor('html_inline', '', 0)
  container_close.content = '</div>'

  token.children = [container_open, checkbox_html, label_html, container_close]

  token.content =
    container_open.content +
    checkbox_html.content +
    label_html.content +
    container_close.content
}

function is_token_type({ token, type }) {
  return token.type === type
}

function starts_with_task_markdown({ token }) {
  return /^\[[xX ]\][ \u00A0]/.test(token.content)
}
