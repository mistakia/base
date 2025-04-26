/**
 * Constants for the change requests module.
 */

// Directory where change request markdown files are stored
export const CHANGE_REQUEST_DIR = 'data/change-requests'

// Valid change request statuses
export const VALID_STATUSES = [
  'Draft',
  'PendingReview',
  'Approved',
  'NeedsRevision',
  'Rejected',
  'Merged',
  'Closed'
]

// Allowed status transitions
export const VALID_TRANSITIONS = {
  Draft: ['PendingReview', 'Closed'],
  PendingReview: ['Approved', 'NeedsRevision', 'Rejected', 'Closed'],
  NeedsRevision: ['PendingReview', 'Closed'],
  Approved: ['Merged', 'PendingReview', 'Closed'],
  Rejected: ['PendingReview', 'Closed'],
  Merged: ['Closed'], // Only allow closing a merged CR
  Closed: ['Draft', 'PendingReview'] // Closed CRs can be reopened
}
