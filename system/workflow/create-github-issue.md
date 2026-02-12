---
title: Create GitHub Issue
type: workflow
description: >-
  Workflow for creating GitHub issues with intelligent inference from text prompts, including
  repository detection, label suggestion, and project integration
base_uri: sys:system/workflow/create-github-issue.md
created_at: '2025-06-14T17:43:40.948Z'
entity_id: 2e148fc3-bd53-4647-9ce5-6847ce8937c3
observations:
  - '[pattern] Natural language analysis can infer repository context and issue metadata'
  - '[practice] User confirmation prevents incorrect issue creation'
  - '[integration] GitHub projects require separate API calls for field management'
  - '[compatibility] Date command syntax differs between macOS and Linux'
prompt_properties:
  - name: issue_description
    type: string
    description: Text description of the issue to create
relations:
  - implements [[sys:system/schema/workflow.md]]
  - follows [[sys:system/guideline/write-workflow.md]]
  - references [[user:text/github-project-reference.md]]
updated_at: '2026-01-05T19:25:16.416Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

<task>Create a GitHub issue by analyzing a text prompt to infer repository, labels, title, and description, then add it to the appropriate project with field values</task>

<context>
This workflow intelligently creates GitHub issues by analyzing a text prompt to determine the appropriate repository, generate a title and description, suggest relevant labels, and add the issue to the correct project with appropriate field values. It uses natural language understanding to streamline the issue creation process.

The workflow requires GitHub CLI (gh) to be installed and authenticated, and uses jq for JSON processing.

For project IDs and field references, see [[user:text/github-project-reference.md]].
</context>

<instructions>
1. **Analyze the issue description** to extract:
   - Potential repository name/context
   - Issue type (bug, feature, enhancement, documentation)
   - Priority indicators (urgent, critical, minor, etc.)
   - Technical keywords for label inference
   
2. **Get list of available repositories:**
   ```
   # For macOS (BSD date):
   gh repo list --limit 100 --json name,owner,description,repositoryTopics,updatedAt | jq --arg cutoff_date "$(date -v-1y +%Y-%m-%d)" '[.[] | select(.updatedAt > ($cutoff_date + "T00:00:00Z"))]'
   
   # For Linux (GNU date):
   gh repo list --limit 100 --json name,owner,description,repositoryTopics,updatedAt | jq --arg cutoff_date "$(date -d '1 year ago' -Iseconds)" '[.[] | select(.updatedAt > $cutoff_date)]'
   ```

3. **Infer the most likely repository** based on:

   - Repository names mentioned in the prompt
   - Technical keywords matching repo descriptions/topics
   - Recent activity (check current directory first)
   - If unclear, show top 3-5 matches and ask user to confirm

4. **Generate issue title and description:**

   - Title: Concise summary of the prompt (max 80 chars)
   - Description: Expanded version with:
     - Problem statement
     - Expected behavior (if applicable)
     - Technical context
     - Any mentioned acceptance criteria

5. **Get available labels for the selected repository:**

   ```
   gh label list --repo OWNER/REPO --json name,description
   ```

6. **Suggest labels** based on:

   - Issue type detection (bug, feature, enhancement, etc.)
   - Priority keywords (urgent→high, minor→low)
   - Technical areas mentioned (frontend, backend, API, etc.)
   - Status (new issues get "needs triage" or "ready for work")

7. **Present the inferred details to user for confirmation:**

   - Repository: OWNER/REPO
   - Title: GENERATED_TITLE
   - Description: GENERATED_DESCRIPTION
   - Suggested labels: [list]

   Ask: "Create issue with these details? (y/n) or type 'edit' to modify"

8. **Create the issue** after confirmation:

   **IMPORTANT: For extensive issue bodies (e.g., implementation plans), always use a temporary file to avoid shell escaping issues:**

   ```bash
   # Create a unique temporary file to avoid conflicts with concurrent processes
   UNIQUE_ID=$(date +%s%N)_$$  # timestamp in nanoseconds + process ID
   TEMP_FILE="/tmp/issue_body_${UNIQUE_ID}.md"

   # Write the body content to the temporary file using printf or echo
   printf '%s\n' "ISSUE_BODY_CONTENT_HERE" > "$TEMP_FILE"

   # OR use echo -e for multiline content
   echo -e "Line 1\nLine 2\nLine 3" > "$TEMP_FILE"

   # Create the issue using the file
   gh issue create --repo OWNER/REPO --title "TITLE" --body-file "$TEMP_FILE" --label "label1,label2"

   # Clean up the temporary file
   rm "$TEMP_FILE"
   ```

   **For simple, short issue bodies without special characters, you can use the direct method:**

   ```bash
   gh issue create --repo OWNER/REPO --title "TITLE" --body "SIMPLE_BODY" --label "label1,label2"
   ```

9. **Determine target project:**

   - If repo is "mistakia/league" → use "xo.football" project
   - All other repos → use "Trashman Task Manager" project

   Find the project:

   ```
   gh project list --owner OWNER --format json | jq '.projects[] | select(.title=="PROJECT_NAME")'
   ```

10. **Get project fields and their options:**

    ```
    gh project field-list PROJECT_NUMBER --owner OWNER --format json
    ```

11. **Suggest field values** based on issue analysis:

    - Status: Map to available options like "Planned", "Started", "In Progress", etc.
    - Priority: Map labels like "priority/medium" → "3 medium", "priority/high" → "4 high"
    - Type: Match to issue type from labels
    - Sprint: Current/Next/Backlog
    - Estimate: Based on complexity keywords

    Present suggestions: "Suggested project fields (edit as needed):"

    Note: Check actual field names and options from the project, as they may vary:

    - Look for fields like "Status", "priority" (lowercase), etc.
    - Priority options may be numbered like "1 none", "2 low", "3 medium", "4 high", "5 critical"

12. **Add issue to project** with confirmed field values:

    ```
    gh project item-add PROJECT_NUMBER --url ISSUE_URL --owner OWNER --format json
    ```

    This returns the project item ID which is needed for setting field values.

13. **Set each field value** using the returned item ID:
    ```
    # Extract project ID from step 9 (format: PVT_kwHOABvSe84...)
    # Use the item ID from step 12 (format: PVTI_lAHOABvSe84...)
    gh project item-edit --project-id PROJECT_ID --id ITEM_ID --field-id FIELD_ID --single-select-option-id OPTION_ID
    ```

## Error Handling

- If no repos found: Ask for owner/repo format
- If project not found: List available projects
- If field value invalid: Show valid options
- If auth fails for basic operations: Guide through `gh auth login`
- If auth fails for projects: Guide through `gh auth refresh -s project --hostname github.com`
- If "topics" field error: Use "repositoryTopics" instead
- If date command fails on macOS: Use BSD date format with -v flag instead of -d flag
- If project item not found immediately after adding: There may be a delay, try searching again
- **If issue creation fails with shell escaping errors**: Always use `--body-file` with a temporary file for extensive content. Avoid heredocs for complex content - use `printf` or `echo -e` instead

### Common Troubleshooting Examples

1. **macOS date command fix:**

   ```bash
   # Wrong (Linux):
   date -d '1 year ago' -Iseconds

   # Correct (macOS):
   date -v-1y +%Y-%m-%d
   ```

2. **Project list JSON structure:**

   ```bash
   # The response has a "projects" wrapper:
   gh project list --owner OWNER --format json | jq '.projects[]'
   ```

3. **Finding project item after adding:**

   ```bash
   # Search by URL:
   gh project item-list PROJECT_NUMBER --owner OWNER --format json | jq '.items[] | select(.content.url == "ISSUE_URL")'

   # Search by repository and number:
   gh project item-list PROJECT_NUMBER --owner OWNER --format json | jq '.items[] | select(.content.repository == "OWNER/REPO" and .content.number == ISSUE_NUMBER)'
   ```

4. **Heredoc alternatives for complex content:**

   ```bash
   # Create a unique temporary file first
   UNIQUE_ID=$(date +%s%N)_$$  # timestamp in nanoseconds + process ID
   TEMP_FILE="/tmp/issue_body_${UNIQUE_ID}.md"

   # Instead of heredoc with EOF delimiter issues:
   cat > "$TEMP_FILE" << 'EOF'
   Complex content here...
   EOF

   # Use printf for reliable multiline content:
   printf '%s\n' \
     "# Title" \
     "" \
     "## Section" \
     "Content with \`backticks\` and \"quotes\"" \
     > "$TEMP_FILE"

   # Or echo -e for simple multiline:
   echo -e "Line 1\nLine 2\nLine 3" > "$TEMP_FILE"
   ```

5. **Project field mapping examples:**
   ```
   GitHub Label → Project Field
   priority/medium → priority: "3 medium"
   kind/enhancement → (no direct mapping, set manually)
   status/ready → Status: "Planned"
   ```
   </instructions>

<output_format>
Display results as:

```
🎫 Issue created successfully!

Repository: OWNER/REPO
Issue: #NUMBER - TITLE
URL: https://github.com/OWNER/REPO/issues/NUMBER

Labels: 🏷️  label1, label2, label3

Project: 📊 PROJECT_NAME
Project URL: https://github.com/orgs/OWNER/projects/NUMBER
Fields set:
- Status: TODO_VALUE
- Priority: PRIORITY_VALUE
- Type: TYPE_VALUE
- [Other fields]: VALUES
```

</output_format>
