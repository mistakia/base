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

// Thread-Entity relations (forward)
export const RELATION_ACCESSES = 'accesses'
export const RELATION_MODIFIES = 'modifies'
export const RELATION_CREATES = 'creates'

// Thread-Entity relations (reverse)
export const RELATION_ACCESSED_BY = 'accessed_by'
export const RELATION_MODIFIED_BY = 'modified_by'
export const RELATION_CREATED_BY = 'created_by'

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
  RELATION_SUCCEEDS,
  RELATION_ACCESSES,
  RELATION_MODIFIES,
  RELATION_CREATES,
  RELATION_ACCESSED_BY,
  RELATION_MODIFIED_BY,
  RELATION_CREATED_BY
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
  involvement: [RELATION_INVOLVES],
  thread_entity: [
    RELATION_ACCESSES,
    RELATION_MODIFIES,
    RELATION_CREATES,
    RELATION_ACCESSED_BY,
    RELATION_MODIFIED_BY,
    RELATION_CREATED_BY
  ]
}

/**
 * Get all standard relation types
 * @returns {Array} Array of standard relation types
 */
export function get_all_standard_relation_types() {
  return [...common_relation_types]
}

/**
 * Bidirectional mapping between forward and reverse relation types.
 * Each entry maps a relation type to its inverse.
 */
export const RELATION_PAIRS = {
  // Dependency relations
  [RELATION_BLOCKED_BY]: RELATION_BLOCKS,
  [RELATION_BLOCKS]: RELATION_BLOCKED_BY,

  // Hierarchy relations
  [RELATION_SUBTASK_OF]: RELATION_HAS_SUBTASK,
  [RELATION_HAS_SUBTASK]: RELATION_SUBTASK_OF,
  [RELATION_PART_OF]: RELATION_CONTAINS,
  [RELATION_CONTAINS]: RELATION_PART_OF,

  // Membership relations
  [RELATION_MEMBER_OF]: RELATION_HAS_MEMBER,
  [RELATION_HAS_MEMBER]: RELATION_MEMBER_OF,

  // Sequence relations
  [RELATION_PRECEDES]: RELATION_SUCCEEDS,
  [RELATION_SUCCEEDS]: RELATION_PRECEDES,

  // Thread-entity relations
  [RELATION_ACCESSES]: RELATION_ACCESSED_BY,
  [RELATION_ACCESSED_BY]: RELATION_ACCESSES,
  [RELATION_MODIFIES]: RELATION_MODIFIED_BY,
  [RELATION_MODIFIED_BY]: RELATION_MODIFIES,
  [RELATION_CREATES]: RELATION_CREATED_BY,
  [RELATION_CREATED_BY]: RELATION_CREATES
}

/**
 * Priority ordering for relation types (lower number = higher priority).
 * Used for sorting relations in display contexts.
 */
export const RELATION_TYPE_PRIORITY = {
  [RELATION_CREATES]: 1,
  created_by: 1,
  [RELATION_MODIFIES]: 2,
  modified_by: 2,
  implements: 3,
  follows: 4,
  [RELATION_SUBTASK_OF]: 5,
  [RELATION_HAS_SUBTASK]: 6,
  [RELATION_BLOCKED_BY]: 7,
  [RELATION_BLOCKS]: 8,
  [RELATION_PRECEDES]: 9,
  [RELATION_SUCCEEDS]: 10,
  [RELATION_ASSIGNED_TO]: 11,
  calls: 12,
  relates: 20,
  [RELATION_RELATES_TO]: 20,
  [RELATION_ACCESSES]: 30,
  accessed_by: 30
}

/**
 * Get the reverse relation type for a given relation type
 * @param {Object} params
 * @param {string} params.relation_type - The relation type to get the reverse of
 * @returns {string|null} The reverse relation type, or null if no reverse exists
 */
export function get_reverse_relation_type({ relation_type }) {
  return RELATION_PAIRS[relation_type] || null
}

/**
 * Get the priority value for a relation type (lower = higher priority)
 * @param {Object} params
 * @param {string} params.relation_type - The relation type to get priority for
 * @returns {number} Priority value (lower is higher priority, default 50)
 */
export function get_relation_priority({ relation_type }) {
  if (!relation_type) return 100
  return RELATION_TYPE_PRIORITY[relation_type] || 50
}

/**
 * Calculate weighted score for sorting relations.
 * Combines relation type priority with recency (updated_at).
 *
 * Formula: priority_score + recency_score
 * - priority_score: from RELATION_TYPE_PRIORITY (lower = more important)
 * - recency_score: hours since update, capped at 168 (1 week) to prevent
 *   very old items from dominating. Recent items get bonus of 0-10 points.
 *
 * Lower total score = higher in sort order.
 *
 * @param {Object} params
 * @param {string} params.relation_type - The relation type
 * @param {string} params.updated_at - ISO timestamp of last update
 * @returns {number} Combined weighted score (lower = higher priority)
 */
export function calculate_relation_sort_score({ relation_type, updated_at }) {
  const priority_score = get_relation_priority({ relation_type })

  // Calculate recency score (0-10 scale based on hours since update)
  let recency_score = 10 // Default for missing or invalid updated_at
  if (updated_at) {
    const updated_date = new Date(updated_at)
    // Validate that the date is valid (not NaN)
    if (!isNaN(updated_date.getTime())) {
      const now = new Date()
      const hours_since_update = (now - updated_date) / (1000 * 60 * 60)

      // Cap at 168 hours (1 week) - anything older gets same score
      const capped_hours = Math.min(hours_since_update, 168)

      // Scale to 0-10 range (0 hours = 0, 168 hours = 10)
      recency_score = (capped_hours / 168) * 10
    }
  }

  return priority_score + recency_score
}

/**
 * Sort relations by weighted score (priority + recency).
 * Returns a new array, does not mutate the original.
 *
 * @param {Object} params
 * @param {Array} params.relations - Array of relation objects with relation_type and updated_at
 * @returns {Array} Sorted array of relations
 */
export function sort_relations_by_weighted_score({ relations }) {
  if (!Array.isArray(relations) || relations.length === 0) {
    return []
  }

  return [...relations].sort((a, b) => {
    const score_a = calculate_relation_sort_score({
      relation_type: a.relation_type,
      updated_at: a.updated_at
    })
    const score_b = calculate_relation_sort_score({
      relation_type: b.relation_type,
      updated_at: b.updated_at
    })
    return score_a - score_b
  })
}
