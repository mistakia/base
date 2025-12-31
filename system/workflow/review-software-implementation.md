---
title: 'Review Software Implementation Workflow'
type: 'workflow'
description: |
  Review and validate software implementation output from implement-software-task workflow
created_at: '2025-08-01T00:00:00.000Z'
entity_id: 'a1b2c3d4-5e6f-7890-abcd-123456789def'
guidelines:
  - 'sys:system/guideline/write-workflow.md'
  - 'user:guideline/write-software.md'
  - 'sys:system/guideline/write-javascript.md'
  - 'sys:system/guideline/review-software-implementation.md'
prompt_properties:
  - name: review_example
    type: object
    required: false
    description: Example review data for templates
    default:
      working_directory: '../base-worktrees/fix-16-no-auto-change-requests'
      files_changed: ['src/api/routes.mjs', 'src/utils/helper.mjs']
      implementation_plan_file: 'task/github/mistakia/base/16-modify-thread-creation.md'
relations:
  - 'follows [[sys:system/workflow/implement-software-task.md]]'
  - 'uses [[sys:system/guideline/write-workflow.md]]'
  - 'implements [[user:guideline/write-software.md]]'
  - 'implements [[sys:system/guideline/write-javascript.md]]'
  - 'implements [[sys:system/guideline/review-software-implementation.md]]'
updated_at: '2025-08-01T00:00:00.000Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

<task>Review and validate software implementation changes for compliance and quality before commit</task>

<context>This workflow reviews the output from the implement-software-task workflow. It expects unstaged file changes in a git worktree, an updated implementation plan, and follows compliance guidelines from write-software.md and write-javascript.md. The workflow balances automation with human judgment at critical decision points.</context>

<instructions>

Before starting, read [[sys:system/guideline/review-software-implementation.md]].

## Setup Phase

1. **Verify Working Environment**

   - Confirm current working directory matches the implementation worktree
   - Run `git status` to identify all unstaged changes
   - Locate and verify implementation plan file exists and is accessible
   - Document the current state for potential continuation

2. **Initial Assessment**
   - Run `git diff --name-only` to get list of changed files
   - Use `git diff --stat` to get overview of change scope
   - Review implementation plan progress to understand expected changes
   - Create checkpoint: **Phase 1 Complete - Environment Verified**

## Automated Compliance Phase

3. **Delegate Compliance Scanning to Agent**

   - Use Task tool with general-purpose agent to perform automated checks
   - Agent should analyze all changed files for:
     - Variable naming compliance (descriptive, globally unique, contextual)
     - DRY principle violations (code duplication detection)
     - JavaScript ES module import format (`.mjs` extensions, proper organization)
     - File organization standards (200-line limit, function placement)
     - Function parameter patterns (named parameters for multiple args)
   - Agent should return structured findings with file:line references

4. **Process Agent Findings**
   - Review agent-provided compliance report
   - Categorize findings: Critical (must fix), Important (should fix), Minor (optional)
   - Present findings to human for validation and prioritization
   - Create checkpoint: **Phase 2 Complete - Compliance Scan Done**

## Human Review Phase

5. **File-by-File Review**

   - Start with files flagged by compliance scan
   - For each file, perform human review focusing on:
     - **Architecture**: Does implementation match intended design?
     - **Business Logic**: Are changes functionally correct?
     - **Integration**: How do changes affect broader system?
     - **Maintainability**: Is code readable and well-structured?
   - Use `git diff <filename>` to review specific changes
   - Document review decisions and any required fixes

6. **Implementation Plan Reconciliation**
   - Compare actual changes against implementation plan tasks
   - Identify any plan drift or unexpected changes
   - If drift detected:
     - STOP review process
     - Document the drift and reasoning
     - Get explicit approval for plan updates before continuing
   - Update implementation plan with review findings if approved
   - Create checkpoint: **Phase 3 Complete - Human Review Done**

## Resolution Phase

7. **Address Critical Issues**

   - Fix critical compliance violations first
   - Apply fixes following the same guidelines (write-software.md, write-javascript.md)
   - Re-run compliance checks on fixed files using agent delegation
   - Verify fixes don't introduce new issues

8. **Handle Important Issues**
   - Address important findings based on human prioritization
   - Document any deferred issues for future improvement
   - Create checkpoint: **Phase 4 Complete - Issues Resolved**

## Validation Phase

9. **Final Quality Checks**

   - Run test suite: `yarn test:unit --reporter min` and `yarn test:integration --reporter min`
   - Run code quality tools: `yarn lint` and `yarn typecheck` if available
   - Verify all critical issues are resolved
   - Confirm implementation plan alignment

10. **Prepare for Completion**
    - Stage approved changes: `git add .` or selectively stage files
    - Generate summary of review process and decisions
    - Document any remaining issues or technical debt
    - Create checkpoint: **Phase 5 Complete - Ready for Commit**

## Continuation Support

**If Context Overflow Occurs:**

- Use `/continue-review-software-implementation` command
- Current checkpoint will be captured with:
  - Working directory and git state
  - Files reviewed and their status
  - Compliance findings and resolution status
  - Implementation plan progress
  - Human decisions and approvals

## Key Rules

- Use Task tool with agent for automated compliance scanning to minimize context usage
- STOP for human approval on any implementation plan changes
- Address critical compliance issues before proceeding
- Create checkpoints after each major phase for continuation support
- Document all human decisions for future reference
- Maintain working directory verification throughout process
  </instructions>

<output_format>
After completing each phase:

**Phase Completed**: [Phase name and number]

**Working Directory**: [Current worktree path]

**Files Reviewed**: [List of files with review status: approved/needs-fixes/pending]

**Compliance Findings**:

- Critical: [Number] issues
- Important: [Number] issues
- Minor: [Number] issues

**Implementation Plan Status**: [Aligned/Drift Detected/Updated]

**Next Action**: [Next phase or specific action needed]

**Checkpoint Created**: [Checkpoint name for continuation]

---

**Final Summary** (when all phases complete):

**Review Complete**: Software implementation review finished

**Files Modified**: [List of all changed files]

**Issues Resolved**: [Summary of fixes applied]

**Quality Checks**: [Test results, lint results, typecheck results]

**Implementation Plan**: [Final alignment status]

**Ready for Commit**: [Yes/No with any remaining actions needed]
</output_format>
