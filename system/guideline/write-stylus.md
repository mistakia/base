---
title: 'Write Stylus'
type: 'guideline'
description: |
  Guidelines for writing Stylus stylesheets
created_at: '2025-05-27T18:10:20.240Z'
entity_id: '5843993c-489c-442c-a162-f8b12ef8c8ec'
globs:
  - '**/*.styl'
tags:
updated_at: '2025-05-27T18:10:20.240Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Stylus Style Guidelines

## Variables

- Variables MUST use snake_case naming
- Variables MUST be prefixed with `$` for global variables
- Variables SHOULD be defined in `client/styles/variables.styl`

Example:

```stylus
$background_color = white
$border_color = #D0D0D0
```

## Selectors and Properties

- Selectors MUST use kebab-case for class and ID names
- Properties MUST omit semicolons and braces
- Properties SHOULD omit colons when possible
- Properties MUST NOT use colons
- Nested selectors SHOULD be used for component-specific styles

Example:

```stylus
.component-container
  padding 30px 0
  max-width 1000px

  .nested-element
    display flex
    flex-direction column
```

## Layout

- Use Stylus shorthand for positioning properties
- Flexbox SHOULD be used for component layouts
- Container widths SHOULD use max-width for responsiveness

Example:

```stylus
.container
  absolute top 0 left 0 bottom 0 right 0
  display flex
  align-items center
```
