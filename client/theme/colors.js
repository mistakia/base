/**
 * Design System Color Constants
 *
 * Single source of truth for colors in JavaScript.
 * Mirrors variables.styl for consistency.
 *
 * Usage:
 *   import { COLORS } from '@theme/colors.js'
 *   sx={{ color: COLORS.text_secondary }}
 */

// Neutral Colors
const COLOR_WHITE = '#ffffff'
const COLOR_TEXT = '#212529'
const COLOR_TEXT_SECONDARY = '#6c757d'
const COLOR_TEXT_TERTIARY = '#b0b0b0'
const COLOR_BORDER = '#ced4da'
const COLOR_BORDER_LIGHT = '#e9ecef'
const COLOR_SURFACE = '#F7F7F4'
const COLOR_SURFACE_HOVER = '#fafafa'
const COLOR_SURFACE_SECONDARY = '#f8f9fa'

// Accent Colors
const COLOR_BREADCRUMB_DARK = '#4a3520'
const COLOR_BREADCRUMB_LIGHT = '#e8d4c1'
// Breadcrumb bar background - mix of light color (60%) and surface (40%)
// Matches: mix(#E8D4C1, #F7F7F4, 60%)
export const COLOR_BREADCRUMB_BAR_BG = '#eee2d5'
const COLOR_PRIMARY = '#007bff'
const COLOR_PRIMARY_HOVER = '#0069d9'

// Semantic Colors
const COLOR_ERROR = '#d73a49'
const COLOR_SUCCESS = '#28a745'
const COLOR_WARNING = '#f66a0a'
const COLOR_INFO = '#0969da'

// Code/Terminal Colors - using breadcrumb color scheme (lighter shade)
const COLOR_CODE_BG = '#f5eee6' // Lighter cream matching breadcrumb/theme color
const COLOR_CODE_BORDER = '#e8dcc8' // Lighter brown border
const COLOR_TERMINAL_BG = '#0d1117'
const COLOR_TERMINAL_TEXT = '#e6edf3'
const COLOR_TERMINAL_SUCCESS = '#7ee83f'
const COLOR_TERMINAL_ERROR = '#f85149'
const COLOR_TERMINAL_BORDER = '#30363d'
const COLOR_TERMINAL_MUTED = '#8b949e'

// Tool Type Colors
const COLOR_TOOL_FILESYSTEM = '#1976d2'
const COLOR_TOOL_EXECUTION = '#9c27b0'
const COLOR_TOOL_SEARCH = '#0288d1'
const COLOR_TOOL_MANAGEMENT = '#ed6c02'
const COLOR_TOOL_MCP = '#9c27b0'

// Icon Colors (for DirectoryView and similar)
const COLOR_ICON_FOLDER = '#79b8ff'
const COLOR_ICON_FILE = '#959da5'
const COLOR_ICON_LINK = '#0366d6'
const COLOR_ICON_ERROR = '#d73a49' // Aligned with COLOR_ERROR

// Color Palettes (Tailwind-style)
export const GRAY = {
  400: '#9ca3af',
  500: '#6b7280',
  600: '#4b5563'
}

export const AMBER = {
  500: '#f59e0b'
}

export const BLUE = {
  500: '#3b82f6'
}

export const CYAN = {
  500: '#06b6d4'
}

export const INDIGO = {
  500: '#6366f1'
}

export const GREEN = {
  500: '#22c55e'
}

export const RED = {
  400: '#f87171',
  600: '#dc2626'
}

// Consolidated COLORS object for convenience
export const COLORS = {
  // Palettes
  gray: GRAY,
  amber: AMBER,
  blue: BLUE,
  cyan: CYAN,
  indigo: INDIGO,
  green: GREEN,
  red: RED,
  // Neutral
  white: COLOR_WHITE,
  text: COLOR_TEXT,
  text_secondary: COLOR_TEXT_SECONDARY,
  text_tertiary: COLOR_TEXT_TERTIARY,
  border: COLOR_BORDER,
  border_light: COLOR_BORDER_LIGHT,
  surface: COLOR_SURFACE,
  surface_hover: COLOR_SURFACE_HOVER,
  surface_secondary: COLOR_SURFACE_SECONDARY,

  // Accent
  breadcrumb_dark: COLOR_BREADCRUMB_DARK,
  breadcrumb_light: COLOR_BREADCRUMB_LIGHT,
  breadcrumb_bar_bg: COLOR_BREADCRUMB_BAR_BG,
  primary: COLOR_PRIMARY,
  primary_hover: COLOR_PRIMARY_HOVER,

  // Semantic
  error: COLOR_ERROR,
  success: COLOR_SUCCESS,
  warning: COLOR_WARNING,
  info: COLOR_INFO,

  // Code/Terminal
  code_bg: COLOR_CODE_BG,
  code_border: COLOR_CODE_BORDER,
  terminal_bg: COLOR_TERMINAL_BG,
  terminal_text: COLOR_TERMINAL_TEXT,
  terminal_success: COLOR_TERMINAL_SUCCESS,
  terminal_error: COLOR_TERMINAL_ERROR,
  terminal_border: COLOR_TERMINAL_BORDER,
  terminal_muted: COLOR_TERMINAL_MUTED,

  // Tool Types
  tool_filesystem: COLOR_TOOL_FILESYSTEM,
  tool_execution: COLOR_TOOL_EXECUTION,
  tool_search: COLOR_TOOL_SEARCH,
  tool_management: COLOR_TOOL_MANAGEMENT,
  tool_mcp: COLOR_TOOL_MCP,

  // Icons
  icon_folder: COLOR_ICON_FOLDER,
  icon_file: COLOR_ICON_FILE,
  icon_link: COLOR_ICON_LINK,
  icon_error: COLOR_ICON_ERROR
}

export default COLORS
