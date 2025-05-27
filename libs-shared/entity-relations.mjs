/**
 * Standard entity relation type definitions
 * Centralized constants file for relation types used across the application
 */

/**
 * Standard relation type constants
 */
// Association relations
export const RELATION_RELATES_TO = 'relates_to'
export const RELATION_IMPLEMENTS = 'implements'

// Dependency relations
export const RELATION_BLOCKED_BY = 'blocked_by'
export const RELATION_BLOCKS = 'blocks'
export const RELATION_REQUIRES = 'requires'

// Sequence relations
export const RELATION_PRECEDES = 'precedes'
export const RELATION_SUCCEEDS = 'succeeds'

// Hierarchy relations
export const RELATION_PART_OF = 'part_of'
export const RELATION_CONTAINS = 'contains'
export const RELATION_SUBTASK_OF = 'subtask_of'
export const RELATION_HAS_SUBTASK = 'has_subtask'

// Assignment relations
export const RELATION_ASSIGNED_TO = 'assigned_to'

// Membership relations
export const RELATION_MEMBER_OF = 'member_of'
export const RELATION_HAS_MEMBER = 'has_member'

// Resource relations
export const RELATION_NEEDS_ITEM = 'needs_item'
export const RELATION_USES_ITEM = 'uses_item'

// Involvement relations
export const RELATION_INVOLVES = 'involves'

/**
 * Common relation types used across the system
 */
export const common_relation_types = [
  RELATION_RELATES_TO,
  RELATION_IMPLEMENTS,
  RELATION_BLOCKED_BY,
  RELATION_BLOCKS,
  RELATION_ASSIGNED_TO,
  RELATION_PART_OF,
  RELATION_CONTAINS,
  RELATION_HAS_SUBTASK,
  RELATION_REQUIRES,
  RELATION_SUBTASK_OF,
  RELATION_MEMBER_OF,
  RELATION_HAS_MEMBER,
  RELATION_INVOLVES,
  RELATION_NEEDS_ITEM,
  RELATION_USES_ITEM,
  RELATION_PRECEDES,
  RELATION_SUCCEEDS
]

/**
 * Relation types grouped by semantic meaning
 */
export const relation_type_categories = {
  dependency: [RELATION_BLOCKED_BY, RELATION_BLOCKS, RELATION_REQUIRES],
  sequence: [RELATION_PRECEDES, RELATION_SUCCEEDS],
  hierarchy: [
    RELATION_PART_OF,
    RELATION_CONTAINS,
    RELATION_HAS_SUBTASK,
    RELATION_SUBTASK_OF
  ],
  association: [RELATION_RELATES_TO, RELATION_IMPLEMENTS],
  assignment: [RELATION_ASSIGNED_TO],
  membership: [RELATION_MEMBER_OF, RELATION_HAS_MEMBER],
  resource: [RELATION_NEEDS_ITEM, RELATION_USES_ITEM],
  involvement: [RELATION_INVOLVES]
}

/**
 * Get all standard relation types
 * @returns {Array} Array of standard relation types
 */
export function get_all_standard_relation_types() {
  return [...common_relation_types]
}
