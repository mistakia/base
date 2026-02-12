---
title: Review for Non-Public Information
type: workflow
description: >-
  Workflow to systematically review files for personal information, secret information, and other
  non-public data that should be protected
base_uri: sys:system/workflow/review-for-non-public-information.md
created_at: '2025-08-16T06:21:19.774Z'
entity_id: f15d1353-bf90-4ac7-957c-0c4dde4f427f
observations:
  - '[security] Protecting non-public information is critical for security and privacy'
  - '[pattern] CLI scripts provide reliable pattern detection for known sensitive data'
  - '[principle] Combining automated detection with semantic review ensures comprehensive coverage'
prompt_properties:
  - name: directory_path
    type: string
    description: The directory path to review for non-public information
relations:
  - follows [[sys:system/guideline/write-workflow.md]]
  - uses [[sys:system/guideline/review-for-personal-information.md]]
  - uses [[sys:system/guideline/review-for-secret-information.md]]
tags: []
tools:
  - Task
  - Glob
  - Read
  - Edit
  - MultiEdit
  - LS
updated_at: '2026-01-05T19:25:17.449Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

<task>Review a directory structure for non-public information including personal data, secrets, and sensitive content</task>

<context>
This workflow systematically reviews files in a given directory path for various types of non-public information that should be protected or removed. It combines automated pattern detection with semantic review by agents.

The workflow applies two key guidelines:

- [[sys:system/guideline/review-for-personal-information.md]] - For identifying PII
- [[sys:system/guideline/review-for-secret-information.md]] - For identifying credentials and secrets

Directory to review: ${directory_path}
</context>

<instructions>
## Initial Setup: Read Guidelines

First, read and understand the review guidelines:

- Read [[sys:system/guideline/review-for-personal-information.md]] to understand PII patterns
- Read [[sys:system/guideline/review-for-secret-information.md]] to understand secret patterns
- Note all specific patterns and keywords to search for

## Phase 1: Automated Pattern Detection

1. Use file-review tool to find reviewable files

   - Run `cli/file-review.sh check ${directory_path}` to list files needing review
   - Automatically excludes binary files, images, node_modules, .git, etc.
   - Shows files not matching tracked patterns or modified since last review
   - Save the file list for processing

2. Use CLI script to detect sensitive patterns

   - Run `cli/detect-sensitive-patterns.sh` on the file list
   - This checks for known problematic patterns (blacklist):
     - IP addresses, emails, phone numbers
     - API keys, passwords, tokens
     - Database connection strings
     - Private keys, certificates
     - Personal names and locations
   - Output format: filename:line_number:pattern_type:content
   - Alternative/supplementary tools:
     - `grep -r` for recursive pattern searching
     - `rg` (ripgrep) for faster pattern matching
     - `awk` for complex pattern extraction
     - `sed` for pattern analysis
     - `git grep` for searching within git repositories
     - `ag` (silver searcher) for code-aware searching

3. Collect files flagged for semantic review
   - Parse the detection output to get unique file list
   - These files require deeper semantic analysis by agents
   - Useful commands for processing results:
     - `cut -d: -f1` to extract filenames from output
     - `sort -u` to get unique file list
     - `wc -l` to count flagged files
     - `tee` to save results while displaying them
     - `xargs` to process file lists

## Phase 2: Semantic Review by Agents

4. Launch review agents using the Task tool
   - Create multiple agents to review the flagged files
   - Each agent performs semantic analysis beyond pattern matching
5. Agent review instructions:

   ```
   Review the following files for non-public information:
   - Files: [list of flagged files from pattern detection]
   - Apply guidelines from [[sys:system/guideline/review-for-personal-information.md]]
   - Apply guidelines from [[sys:system/guideline/review-for-secret-information.md]]
   - Look for context-dependent sensitive information that patterns might miss
   - Check for: proprietary logic, internal processes, customer data
   - Report findings with specific line numbers and remediation suggestions
   ```

6. Focus areas for semantic review:
   - Context around detected patterns (false positives vs real issues)
   - Sensitive information not caught by patterns
   - Business logic and proprietary algorithms
   - Comments containing sensitive details
   - Configuration files with production settings

## Phase 3: Security Configuration and Tracking Proposals

7. Propose file review patterns for future tracking:

   - Based on the reviewed directory (${directory_path}), recommend scoped patterns:
   - For files found with sensitive content, propose specific patterns relative to the reviewed directory
   - Example proposals (adjust based on actual findings):

     ```bash
     # Proposed patterns - scoped to the specific directory being reviewed
     # Only add patterns for files within ${directory_path}

     # If reviewing a project directory (e.g., ./repository/active/repo):
     cli/file-review.sh add "${directory_path}/*.env"
     cli/file-review.sh add "${directory_path}/**/*.secret"
     cli/file-review.sh add "${directory_path}/config/*.json"

     # If reviewing a specific subdirectory:
     cli/file-review.sh add "${directory_path}/*credentials*"
     cli/file-review.sh add "${directory_path}/*private*"
     ```

   - Important: Patterns should be directory-scoped to avoid impacting unrelated files
   - Do NOT use global patterns like "\*.env" unless explicitly reviewing the entire user-base
   - Provide rationale for each proposed pattern based on findings

8. Propose security configuration updates:

   - Recommend updates to users.json based on findings:
     - Suggest deny rules for sensitive paths discovered
     - Propose "reason" properties explaining each restriction
     - Recommend user group access specifications
   - Do NOT modify users.json directly - only propose changes

9. Document proposed permission changes:
   - List all paths that should potentially be restricted
   - Specify which user groups should have access
   - Provide clear reasoning for each proposed deny rule
   - Include severity assessment for each recommendation
     </instructions>

<output_format>

## Review Summary

### Statistics

- Total files reviewed: X
- Issues found: Y
- Files affected: Z

### Findings by Category

#### Critical - Secrets and Credentials

- File: path/to/file.ext
  - Line X: [Type of secret found]
  - Remediation: [Specific action needed]

#### High - Personal Information

- File: path/to/file.ext
  - Line X: [Type of PII found]
  - Remediation: [Specific action needed]

#### Medium - Other Sensitive Information

- File: path/to/file.ext
  - Line X: [Type of sensitive data]
  - Remediation: [Specific action needed]

### Recommended Actions

1. Immediate actions for critical findings
2. Short-term remediation plan
3. Long-term security improvements

### Proposed File Review Patterns

Based on findings in ${directory_path}:

```bash
# Scoped patterns for future review tracking
cli/file-review.sh add "[specific_path]/[pattern]"
```

- Rationale: [Why this pattern is recommended]

### Proposed Configuration Updates

- Suggested .gitignore additions (scoped to reviewed directory)
- Recommended permission changes in users.json
- Security policy updates
- Note: All proposals are directory-scoped to prevent unintended impacts
  </output_format>
