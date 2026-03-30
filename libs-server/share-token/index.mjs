// Token format constants
export const TOKEN_VERSION = 0x01
export const PAYLOAD_LENGTH = 53
export const TOKEN_TOTAL_LENGTH = PAYLOAD_LENGTH + 64 // 117

// Payload field offsets
export const OFFSET_VERSION = 0
export const OFFSET_ENTITY_ID = 1
export const OFFSET_PUBLIC_KEY = 17
export const OFFSET_EXPIRATION = 49
