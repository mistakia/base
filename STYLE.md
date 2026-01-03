# Base Design System

## Aesthetic: Minimalist Industrial

A technical, utilitarian interface prioritizing clarity and function over decoration. Inspired by terminal interfaces, technical documentation, and industrial design.

## Core Principles

- **Monospace First** - IBM Plex Mono throughout
- **Restrained Color** - Neutral palette with breadcrumb brown accents
- **Minimal Chrome** - No gradients, minimal shadows, subtle borders
- **Functional Hierarchy** - Typography and spacing create structure
- **Terminal Heritage** - Dark code blocks, green success, red errors
- **Square Corners** - No rounded corners on interactive elements

## Architecture Overview

The styling system uses a layered architecture with a single source of truth for design tokens.

```
┌─────────────────────────────────────────────────────────────┐
│                    Design Tokens Layer                       │
│  ┌─────────────────────┐    ┌─────────────────────────────┐ │
│  │   variables.styl    │───▶│   CSS Custom Properties     │ │
│  │   (Stylus source)   │    │   (Runtime access)          │ │
│  └─────────────────────┘    └─────────────────────────────┘ │
│            │                                                 │
│            ▼                                                 │
│  ┌─────────────────────┐                                    │
│  │   colors.js         │  JavaScript access via COLORS obj  │
│  │   (@theme/colors)   │                                    │
│  └─────────────────────┘                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Component Styles Layer                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │  buttons.styl   │  │   chip.styl     │  │  tasks.styl │ │
│  │  (.btn classes) │  │  (.chip class)  │  │  (statuses) │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Page/Layout Styles Layer                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │   pages.styl    │  │ utilities.styl  │  │ Component   │ │
│  │  (page layouts) │  │ (two-column)    │  │  .styl files│ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

```
client/
├── theme/
│   └── colors.js           # JavaScript color constants (COLORS object)
├── styles/
│   ├── variables.styl      # Design tokens (single source of truth)
│   ├── mixins.styl         # Reusable style patterns
│   ├── typography.styl     # Base typography
│   ├── pages.styl          # Page layout styles
│   ├── utilities.styl      # Utility classes (two-column, animations)
│   ├── chip.styl           # Chip component
│   ├── tasks.styl          # Task status/priority colors
│   ├── checkbox.styl       # Checkbox styling
│   └── components/
│       └── buttons.styl    # Button component (.btn classes)
└── views/
    └── components/
        └── primitives/
            └── Button/     # React Button component
```

## Design Tokens

### How Tokens Flow

1. **Define in `variables.styl`**: All colors, spacing, typography defined as Stylus variables
2. **Export to CSS**: Variables exported as CSS custom properties in `:root`
3. **Mirror in `colors.js`**: JavaScript constants mirror Stylus values for use in `sx` props

### Token Naming Convention

- Stylus: `$color_text_secondary` (snake_case with $ prefix)
- CSS: `--color-text-secondary` (kebab-case with -- prefix)
- JavaScript: `COLORS.text_secondary` (snake_case property)

## Color Palette

### Neutral Colors

| Token             | Value   | CSS Variable                | Usage                  |
| ----------------- | ------- | --------------------------- | ---------------------- |
| white             | #ffffff | `--color-white`             | White backgrounds/text |
| text              | #212529 | `--color-text`              | Primary text           |
| text_secondary    | #6c757d | `--color-text-secondary`    | Labels, secondary text |
| text_tertiary     | #b0b0b0 | `--color-text-tertiary`     | Disabled, hints        |
| surface           | #F7F7F4 | `--color-surface`           | Page background        |
| surface_secondary | #f8f9fa | `--color-surface-secondary` | Cards, panels          |
| surface_hover     | #fafafa | `--color-surface-hover`     | Hover states           |
| border            | #ced4da | `--color-border`            | Primary borders        |
| border_light      | #e9ecef | `--color-border-light`      | Subtle dividers        |

### Accent Colors

| Token           | Value   | CSS Variable              | Usage                         |
| --------------- | ------- | ------------------------- | ----------------------------- |
| breadcrumb_dark | #4a3520 | `--color-breadcrumb-dark` | Primary accent, active states |
| primary         | #007bff | `--color-primary`         | Links                         |

### Semantic Colors

| Token   | Value   | CSS Variable      | Usage                       |
| ------- | ------- | ----------------- | --------------------------- |
| error   | #d73a49 | `--color-error`   | Errors, destructive actions |
| success | #28a745 | `--color-success` | Success states              |
| warning | #f66a0a | `--color-warning` | Warnings                    |
| info    | #0969da | `--color-info`    | Information                 |

### Terminal Colors

| Token            | Value   | Usage               |
| ---------------- | ------- | ------------------- |
| terminal_bg      | #0d1117 | Terminal background |
| terminal_text    | #f0f6fc | Terminal text       |
| terminal_prompt  | #58a6ff | Prompt text         |
| terminal_success | #56d364 | Success output      |
| terminal_error   | #f85149 | Error output        |
| terminal_muted   | #8b949e | Muted output        |
| terminal_border  | #30363d | Terminal borders    |

### Code Block Colors

| Token       | Value   | Usage                                                           |
| ----------- | ------- | --------------------------------------------------------------- |
| code_bg     | #f5eee6 | Code block background (lighter shade of breadcrumb/theme color) |
| code_border | #e8dcc8 | Code block border (lighter brown)                               |

### Diff Colors

| Token           | Value   | Usage                   |
| --------------- | ------- | ----------------------- |
| diff_removed_bg | #ffeef0 | Removed line background |
| diff_added_bg   | #e6ffed | Added line background   |

### Icon Colors

| Token       | Value   | Usage             |
| ----------- | ------- | ----------------- |
| icon_folder | #79b8ff | Folder icons      |
| icon_file   | #959da5 | File icons        |
| icon_link   | #0366d6 | Link icons        |
| icon_error  | #d73a49 | Error state icons |

## Typography

- **Font**: `'IBM Plex Mono', 'Monaco', 'Menlo', 'Ubuntu Mono', monospace`
- **Scale**: 11px (xs) / 12px (sm) / 14-15px (base) / 18px (xl)
- **Weights**: 500 (medium), 600 (semibold), 700 (bold)
- **Labels**: Uppercase with 0.5px letter-spacing

## Spacing

8px modular grid:

| Token | Value |
| ----- | ----- |
| xxs   | 2px   |
| xs    | 4px   |
| sm    | 8px   |
| base  | 16px  |
| lg    | 24px  |
| xl    | 32px  |
| 2xl   | 48px  |
| 3xl   | 64px  |

## Borders and Radii

- **Border Radius**: 0 for buttons/interactive elements, 2-4px for containers
- **Borders**: 1px solid, use color tokens

## Shadows

Minimal. Reserve for overlays and modals only.

| Token     | Value                         |
| --------- | ----------------------------- |
| shadow_xs | `0 2px 8px rgba(0,0,0,0.08)`  |
| shadow_sm | `0 4px 12px rgba(0,0,0,0.05)` |

## Buttons

### Variants

| Variant   | Background      | Text           | Border | Usage           |
| --------- | --------------- | -------------- | ------ | --------------- |
| primary   | breadcrumb_dark | white          | none   | Main actions    |
| secondary | transparent     | text_secondary | border | Cancel, dismiss |
| ghost     | transparent     | text_secondary | none   | Inline actions  |
| danger    | error           | white          | none   | Destructive     |
| warning   | warning         | white          | none   | Caution actions |

### Sizes

| Size   | Height | Padding | Font Size |
| ------ | ------ | ------- | --------- |
| small  | 24px   | 0 8px   | 10px      |
| medium | 32px   | 0 16px  | 11px      |

### Properties

- Border radius: 0 (square corners)
- Text: uppercase with 0.5px letter-spacing
- No box-shadow
- Hover: opacity 0.9 or subtle background shift
- Focus: 2px ring using primary at 20% opacity
- Disabled: tertiary text color

## Dialogs/Modals

- Border radius: 0 (square corners)
- Use `PaperProps={{ sx: { borderRadius: 0 } }}` for MUI Dialog

## Interactive States

- **Hover**: Opacity 0.9 or background color shift
- **Focus**: 2px ring using primary color at 20% opacity
- **Disabled**: Tertiary text color, reduced opacity
- **Active**: Breadcrumb dark background

## Code Blocks

- **Light**: Background `code_bg`, border `code_border`
- **Dark (terminal)**: Background `terminal_bg`, text `terminal_text`
- **Success output**: `terminal_success`
- **Error output**: `terminal_error`

## Usage Guidelines

### JavaScript (React Components)

Import colors from `@theme/colors.js`:

```javascript
import { COLORS } from '@theme/colors.js'

// Use in sx props
<Box sx={{
  color: COLORS.text_secondary,
  borderColor: COLORS.border,
  backgroundColor: COLORS.surface_hover
}} />

// Use in inline styles
<span style={{ color: COLORS.error }}>Error message</span>
```

### CSS/Stylus

Use Stylus variables (preferred) or CSS custom properties:

```stylus
@import './variables'

.my-component
  color: $color_text_secondary
  border: 1px solid $color_border
  background: $color_surface
```

For runtime theming or CSS-only contexts:

```css
.my-component {
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}
```

### React Button Component

Use the custom Button component instead of MUI Button:

```javascript
import Button from '@components/primitives/Button'

// Variants
<Button variant="primary">Submit</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="ghost">Details</Button>
<Button variant="danger">Delete</Button>
<Button variant="warning">Archive</Button>

// Sizes
<Button size="small">Small</Button>
<Button size="medium">Medium</Button>

// Icon button (square)
<Button variant="ghost" size="small" icon>
  <CloseIcon />
</Button>

// Full width
<Button variant="primary" full_width>Submit</Button>
```

### Chip Component

Use the `.chip` CSS class:

```javascript
<span className='chip'>Label</span>
```

### Two-Column Layout

Use the utility classes from `utilities.styl`:

```javascript
<div className='two-column-container'>
  <div className='two-column-left'>Main content</div>
  <div className='two-column-right two-column-right-sticky'>Sidebar</div>
</div>
```

## Anti-Patterns to Avoid

1. **Never hardcode colors** - Always use COLORS constants or CSS variables
2. **Never use MUI Button** - Use the custom Button component
3. **Never use border-radius > 4px** - Keep corners minimal
4. **Never add decorative gradients or shadows** - Keep it utilitarian
5. **Never use non-monospace fonts** - IBM Plex Mono everywhere
