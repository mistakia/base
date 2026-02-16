---
title: Simplify Software Implementation
type: guideline
description: >-
  Guidelines for simplifying software implementation to reduce complexity while preserving
  functionality
base_uri: sys:system/guideline/simplify-software-implementation.md
created_at: '2026-01-13T18:51:06.255Z'
entity_id: 821155d9-a96e-4bed-8e69-8e4571281bbd
globs:
  - '**/*.mjs'
  - '**/*.js'
  - '**/*.ts'
  - '**/*.py'
observations:
  - '[philosophy] Every line of software is a liability with maintenance burden and bug risk'
  - '[principle] Simplest solution that works is the best solution'
  - '[readability] Explicit software is better than clever software'
  - '[maintainability] Minimal complexity reduces cognitive overhead'
public_read: true
relations:
  - follows [[sys:system/guideline/starting-point-philosophy.md]]
  - implements [[sys:system/guideline/write-software.md]]
  - related_to [[sys:system/guideline/review-software.md]]
updated_at: '2026-01-13T18:51:06.255Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
visibility_analyzed_at: '2026-02-16T04:29:22.177Z'
---

# Simplify Software Implementation

Follow the [[sys:system/guideline/starting-point-philosophy.md]] when simplifying software implementation.

## Core Philosophy

Every line of software is a liability. Software carries maintenance burden, cognitive overhead, and bug risk. The goal is to preserve functionality while minimizing these costs through ruthless minimalism.

## YAGNI Principle (You Aren't Gonna Need It)

- Speculative software MUST be removed
- Extensibility hooks MUST NOT be added without immediate use
- Abstractions MUST serve current needs, not hypothetical future requirements
- Feature flags MUST NOT be used for software that may never be enabled
- Configuration options MUST NOT be added for settings that will never change

## Simplification Standards

### Line-by-Line Necessity

- Each line of software MUST justify its existence
- Dead software paths MUST be removed entirely
- Commented-out software MUST be deleted, not preserved
- Unused variables, imports, and functions MUST be removed

### Logic Simplification

- Complex nested conditionals SHOULD be flattened or converted to early returns
- Boolean expressions SHOULD be simplified to their minimal form
- Ternary expressions MUST NOT be nested - prefer if/else or switch statements
- Guard clauses SHOULD replace deeply nested conditions

### Redundancy Elimination

- Duplicate null/undefined checks MUST be consolidated
- Repeated validation logic MUST be extracted
- Similar software blocks MUST be unified or abstracted
- Redundant type conversions MUST be removed

### Abstraction Scrutiny

- Abstractions MUST provide clear simplification benefit
- Single-use wrappers SHOULD be inlined
- Interfaces with single implementations SHOULD be questioned
- Inheritance hierarchies SHOULD be flattened when possible

## Readability Over Cleverness

- Self-documenting software MUST be preferred over comments
- Explicit software MUST be preferred over compact/clever solutions
- Variable names MUST reveal intent without requiring context lookup
- Function length SHOULD allow understanding without scrolling

## What NOT to Simplify

- Error handling that provides meaningful feedback MUST be preserved
- Validation at system boundaries MUST be maintained
- Abstractions that genuinely reduce complexity SHOULD be kept
- Software clarity MUST NOT be sacrificed for fewer lines

## Assessment Criteria

When reviewing software for simplification opportunities, evaluate:

1. **Necessity**: Does this software serve an immediate, concrete purpose?
2. **Duplication**: Is this logic repeated elsewhere in modified form?
3. **Complexity**: Could this be expressed more directly?
4. **Abstraction Level**: Is the abstraction justified by actual reuse?
5. **Future-Proofing**: Is software written for scenarios that may never occur?
