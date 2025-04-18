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
export const RELATION_DEPENDS_ON = 'depends_on'
export const RELATION_REQUIRES = 'requires'

// Hierarchy relations
export const RELATION_PART_OF = 'part_of'
export const RELATION_CONTAINS = 'contains'
export const RELATION_PARENT_OF = 'parent_of'
export const RELATION_CHILD_OF = 'child_of'

// Assignment relations
export const RELATION_ASSIGNED_TO = 'assigned_to'

// Membership relations
export const RELATION_MEMBER_OF = 'member_of'
export const RELATION_HAS_MEMBER = 'has_member'

// Workflow relations
export const RELATION_FOLLOWS = 'follows'
export const RELATION_EXECUTES = 'executes'

// Involvement relations
export const RELATION_INVOLVES = 'involves'

/**
 * Canonical relation types mapping
 * Maps non-standard relation types to their canonical equivalents
 */
export const canonical_relation_map = {
  subtask_of: RELATION_CHILD_OF,
  uses: RELATION_REQUIRES,
  belongs_to: RELATION_MEMBER_OF,
  includes: RELATION_HAS_MEMBER
}

/**
 * Common relation types used across the system
 */
export const common_relation_types = [
  RELATION_RELATES_TO,
  RELATION_IMPLEMENTS,
  RELATION_DEPENDS_ON,
  RELATION_ASSIGNED_TO,
  RELATION_PART_OF,
  RELATION_CONTAINS,
  RELATION_PARENT_OF,
  RELATION_FOLLOWS,
  RELATION_EXECUTES,
  RELATION_REQUIRES,
  RELATION_CHILD_OF,
  RELATION_MEMBER_OF,
  RELATION_HAS_MEMBER,
  RELATION_INVOLVES
]

/**
 * Relation types grouped by semantic meaning
 */
export const relation_type_categories = {
  dependency: [RELATION_DEPENDS_ON, RELATION_REQUIRES],
  hierarchy: [
    RELATION_PART_OF,
    RELATION_CONTAINS,
    RELATION_PARENT_OF,
    RELATION_CHILD_OF
  ],
  association: [RELATION_RELATES_TO, RELATION_IMPLEMENTS],
  assignment: [RELATION_ASSIGNED_TO],
  membership: [RELATION_MEMBER_OF, RELATION_HAS_MEMBER],
  workflow: [RELATION_FOLLOWS, RELATION_EXECUTES],
  involvement: [RELATION_INVOLVES]
}

/**
 * Get all standard relation types
 * @returns {Array} Array of standard relation types
 */
export function get_all_standard_relation_types() {
  return [...common_relation_types]
}

/**
 * Converts a relation type to its canonical form
 * @param {string} relation_type The relation type to normalize
 * @returns {string} The canonical relation type
 */
export function get_canonical_relation_type(relation_type) {
  return canonical_relation_map[relation_type] || relation_type
}
