# Claude Session Import

This document describes how to import Claude Code sessions from `~/.claude/projects/` into Base execution threads.

## Overview

The Claude integration converts local Claude Code JSONL files into Base system execution threads, preserving the conversation history, tool calls, and metadata. Each Claude session becomes a separate thread with a complete timeline of interactions.

## CLI Usage

### List Available Sessions

```bash
# List all Claude sessions
node scripts/convert-claude-sessions.mjs list

# List with detailed summaries
node scripts/convert-claude-sessions.mjs list --summaries --verbose
```

### Validate Sessions

```bash
# Check session file validity
node scripts/convert-claude-sessions.mjs validate --verbose
```

### Import Sessions

```bash
# Dry run to see what would be imported
node scripts/convert-claude-sessions.mjs import --dry-run --verbose

# Import all sessions
node scripts/convert-claude-sessions.mjs import --verbose

# Import specific session
node scripts/convert-claude-sessions.mjs import --session-id "5ede99f2-c215-4e31-aa24-9cdfd5070feb"

# Import sessions from date range
node scripts/convert-claude-sessions.mjs import --from-date "2025-06-15" --to-date "2025-06-20"

# Import only small sessions (under 50 entries)
node scripts/convert-claude-sessions.mjs import --max-entries 50

# Specify custom directories
node scripts/convert-claude-sessions.mjs import \
  --projects-dir "~/custom/claude/projects" \
  --user-base-dir "/custom/user-base"
```

## CLI Options

### Global Options

- `--projects-dir <dir>`: Claude projects directory (default: `~/.claude/projects`)
- `--verbose`: Enable detailed logging
- `--help`: Show help information

### Import Options

- `--user-base-dir <dir>`: User base directory for thread storage
- `--session-id <id>`: Import only specific session ID
- `--from-date <date>`: Import sessions from date (YYYY-MM-DD format)
- `--to-date <date>`: Import sessions to date (YYYY-MM-DD format)
- `--max-entries <num>`: Skip sessions with more than N entries
- `--dry-run`: Preview what would be imported without creating threads

## Session Format

Claude sessions are stored as JSONL files with the following entry types:

### Summary Entries
```json
{
  "type": "summary",
  "summary": "Session description",
  "leafUuid": "uuid"
}
```

### User Messages
```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": "User input"
  },
  "uuid": "entry-uuid",
  "parentUuid": "parent-uuid",
  "timestamp": "2025-06-19T14:07:25.835Z",
  "sessionId": "session-uuid",
  "cwd": "/working/directory"
}
```

### Assistant Messages
```json
{
  "type": "assistant",
  "message": {
    "role": "assistant",
    "model": "claude-sonnet-4-20250514",
    "content": [
      {
        "type": "text",
        "text": "Response text"
      },
      {
        "type": "tool_use",
        "id": "tool-id",
        "name": "ToolName",
        "input": { "parameters": "..." }
      }
    ],
    "usage": {
      "input_tokens": 100,
      "output_tokens": 50
    }
  },
  "uuid": "entry-uuid",
  "parentUuid": "parent-uuid",
  "timestamp": "2025-06-19T14:07:32.123Z"
}
```

## Thread Structure

Each imported Claude session creates:

### Thread Directory
```
/user-base/thread/{thread-id}/
├── metadata.json      # Thread configuration and metadata
├── timeline.json      # Chronological timeline of all interactions
└── memory/           # Thread memory directory (git repository)
    └── .gitignore
```

### Thread ID Generation

Thread IDs are deterministically generated from session IDs using UUIDv5:
- Namespace: `6ba7b810-9dad-11d1-80b4-00c04fd430c8`
- Input: `claude:{session-id}`

This ensures consistent thread IDs across multiple imports.

### Timeline Entries

The timeline contains entries for:

1. **Session Import Started** - Initial state change
2. **Message Entries** - User and assistant messages
3. **Tool Call Entries** - Tool invocations (when detected)
4. **Tool Result Entries** - Tool outputs (when detected)
5. **State Change Entries** - Session summaries and status changes
6. **Session Import Completed** - Final state change

## Integration with Base System

### Thread States

Imported sessions have `thread_state: "terminated"` since they represent completed interactions.

### Metadata

Each thread includes:
- Original session ID and provider information
- Working directory from Claude session
- Token usage statistics
- Session duration and timing
- Source file information

### Workflow Association

Threads are associated with `sys:system/workflow/external-session-import.md` workflow (to be created).

## Error Handling

### Session Validation

Sessions are validated for:
- Required fields (session_id, entries, metadata)
- Entry structure (uuid, timestamp, type)
- JSON format validity

### Import Safety

- Duplicate detection prevents re-importing existing threads
- Malformed entries are logged but don't stop processing
- Failed thread creation is reported but doesn't halt batch operations

### Logging

Enable debug logging with:
```bash
DEBUG="integrations:claude:*" node scripts/convert-claude-sessions.mjs import
```

## Examples

### Basic Import Workflow

1. **Check what's available:**
   ```bash
   node scripts/convert-claude-sessions.mjs list --summaries
   ```

2. **Validate files:**
   ```bash
   node scripts/convert-claude-sessions.mjs validate
   ```

3. **Dry run:**
   ```bash
   node scripts/convert-claude-sessions.mjs import --dry-run
   ```

4. **Import small sessions first:**
   ```bash
   node scripts/convert-claude-sessions.mjs import --max-entries 20 --verbose
   ```

5. **Import remaining sessions:**
   ```bash
   node scripts/convert-claude-sessions.mjs import --verbose
   ```

### Selective Import

Import specific session:
```bash
node scripts/convert-claude-sessions.mjs import \
  --session-id "bb6bb925-7661-451a-97a4-58c807153f22" \
  --verbose
```

Import recent sessions:
```bash
node scripts/convert-claude-sessions.mjs import \
  --from-date "2025-06-15" \
  --verbose
```

## Troubleshooting

### Common Issues

1. **Permission Errors**: Ensure user base directory is writable
2. **Git Errors**: Memory directory git initialization may fail (non-critical)
3. **Large Sessions**: Use `--max-entries` to filter large sessions
4. **Invalid Sessions**: Check validation output for specific errors

### Debug Mode

For detailed troubleshooting:
```bash
DEBUG="integrations:claude:*,integrations:thread:*" \
  node scripts/convert-claude-sessions.mjs import --verbose
```

This enables debug logging for both Claude and thread integration modules.