const IS_DEV = process.env.NODE_ENV === 'development'

export const safe_error_message = (error) =>
  IS_DEV ? error?.message : 'Internal server error'
