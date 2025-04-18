/**
 * Standard entity relation type mappings
 * Centralized constants file for relation mappings used across the application
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
 * Used for backward compatibility
 */
export const canonical_relation_map = {
  subtask_of: RELATION_CHILD_OF,
  uses: RELATION_REQUIRES,
  belongs_to: RELATION_MEMBER_OF,
  includes: RELATION_HAS_MEMBER
}

/**
 * Maps relation types to frontmatter properties for each entity type
 * Used for converting database relations to frontmatter properties
 */
export const relation_mappings = {
  task: {
    [RELATION_ASSIGNED_TO]: 'persons',
    [RELATION_REQUIRES]: {
      physical_item: 'physical_items',
      digital_item: 'digital_items'
    },
    [RELATION_CHILD_OF]: 'parent_tasks',
    [RELATION_DEPENDS_ON]: 'dependent_tasks',
    [RELATION_EXECUTES]: 'activities',
    [RELATION_INVOLVES]: 'organizations'
  },
  physical_item: {
    [RELATION_PART_OF]: 'parent_items',
    [RELATION_CONTAINS]: 'child_items',
    [RELATION_PARENT_OF]: 'child_items'
  },
  person: {
    [RELATION_MEMBER_OF]: 'organizations'
  },
  organization: {
    [RELATION_HAS_MEMBER]: 'members'
  },
  activity: {
    [RELATION_FOLLOWS]: 'guidelines'
  },
  guideline: {},
  digital_item: {},
  physical_location: {},
  tag: {},
  database: {},
  database_item: {},
  database_view: {}
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
 * Get all standard relation types from the mappings
 * @returns {Array} Array of standard relation types
 */
export function get_all_standard_relation_types() {
  const standard_relation_types = []

  Object.values(relation_mappings).forEach((type_map) => {
    Object.keys(type_map).forEach((rel_type) => {
      if (!standard_relation_types.includes(rel_type)) {
        standard_relation_types.push(rel_type)
      }
    })
  })

  return standard_relation_types
}

/**
 * Converts a relation type to its canonical form
 * @param {string} relation_type The relation type to normalize
 * @returns {string} The canonical relation type
 */
export function get_canonical_relation_type(relation_type) {
  return canonical_relation_map[relation_type] || relation_type
}
