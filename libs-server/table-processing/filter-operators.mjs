/**
 * @fileoverview React-table filter operator implementations
 * Provides mapping of filter operators to their implementation functions
 */

import { TABLE_OPERATORS } from 'react-table/src/constants.mjs'

/**
 * React-table filter operators mapping
 * Maps operator strings to their implementation functions
 */
export const FILTER_OPERATORS = {
  [TABLE_OPERATORS.EQUAL]: (value, filterValue) => value === filterValue,
  [TABLE_OPERATORS.NOT_EQUAL]: (value, filterValue) => value !== filterValue,
  [TABLE_OPERATORS.GREATER_THAN]: (value, filterValue) =>
    Number(value) > Number(filterValue),
  [TABLE_OPERATORS.GREATER_THAN_OR_EQUAL]: (value, filterValue) =>
    Number(value) >= Number(filterValue),
  [TABLE_OPERATORS.LESS_THAN]: (value, filterValue) =>
    Number(value) < Number(filterValue),
  [TABLE_OPERATORS.LESS_THAN_OR_EQUAL]: (value, filterValue) =>
    Number(value) <= Number(filterValue),
  [TABLE_OPERATORS.LIKE]: (value, filterValue) =>
    String(value).toLowerCase().includes(String(filterValue).toLowerCase()),
  [TABLE_OPERATORS.NOT_LIKE]: (value, filterValue) =>
    !String(value).toLowerCase().includes(String(filterValue).toLowerCase()),
  [TABLE_OPERATORS.IN]: (value, filterValue) =>
    Array.isArray(filterValue) && filterValue.includes(value),
  [TABLE_OPERATORS.NOT_IN]: (value, filterValue) =>
    Array.isArray(filterValue) && !filterValue.includes(value),
  [TABLE_OPERATORS.IS_NULL]: (value) => value === null || value === undefined,
  [TABLE_OPERATORS.IS_NOT_NULL]: (value) =>
    value !== null && value !== undefined,
  'IS EMPTY': (value) => value === null || value === undefined || value === '',
  'IS NOT EMPTY': (value) =>
    value !== null && value !== undefined && value !== '',
  'IS_NULL_OR_IN_PAST': (value) =>
    value === null || value === undefined || new Date(value) <= new Date()
}

/**
 * Get all available filter operator names
 * @returns {string[]} Array of operator names
 */
export function get_operator_names() {
  return Object.keys(FILTER_OPERATORS)
}

/**
 * Check if an operator is valid
 * @param {string} operator - Operator to validate
 * @returns {boolean} True if operator is valid
 */
export function is_valid_operator(operator) {
  return operator in FILTER_OPERATORS
}

/**
 * Get operator function by name
 * @param {string} operator - Operator name
 * @returns {Function|null} Operator function or null if not found
 */
export function get_operator_function(operator) {
  return FILTER_OPERATORS[operator] || null
}

export default FILTER_OPERATORS
