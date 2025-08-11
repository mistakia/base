import { useMemo } from 'react'
import { entity_field_config } from '../field-config.js'

export const use_frontmatter_fields = ({ frontmatter }) => {
  const { always_visible, expandable } =
    entity_field_config[frontmatter.type] || entity_field_config.default

  return useMemo(() => {
    const available_always_visible = always_visible.filter((key_name) =>
      Object.prototype.hasOwnProperty.call(frontmatter, key_name)
    )

    const available_expandable = expandable.filter((key_name) =>
      Object.prototype.hasOwnProperty.call(frontmatter, key_name)
    )

    const excluded_keys = new Set([
      ...always_visible,
      ...expandable,
      'title',
      'description',
      'type'
    ])

    const other_keys = Object.keys(frontmatter).filter(
      (key_name) => !excluded_keys.has(key_name)
    )

    return { available_always_visible, available_expandable, other_keys }
  }, [frontmatter, always_visible, expandable])
}
