# Cursor Rules

This directory contains Cursor rules (`.mdc` files) that provide guidance and enforce conventions in the Cursor editor.

## Guidelines as Cursor Rules

Our project guidelines (located in `/system/guideline` and `/data/guideline`) are automatically converted to Cursor rules. This approach:

1. Prevents duplication of content
2. Ensures guidelines and Cursor rules remain in sync
3. Makes it easy to add new guidelines that automatically become Cursor rules
4. Handles the required formatting changes for Cursor rules

## How It Works

The system automatically:

- Reads each `.md` file in the guidelines directories
- Reformats the YAML frontmatter for Cursor rules:
  - Converts `always_apply` to `alwaysApply`
  - Changes `globs: [item1, item2]` to `globs: item1, item2` (removing brackets and quotes)
- Saves them as formatted `.mdc` files in `.cursor/rules/` with prefixes:
  - `system-` prefix for files from `/system/guideline/`
  - `user-` prefix for files from `/data/guideline/`
- The `scripts/sync-guidelines-cursor-rules.sh` script maintains these files automatically

## Updating Rules

When new guidelines are added or existing ones are modified:

1. Run the sync script:

   ```bash
   # From the project root
   ./scripts/sync-guidelines-cursor-rules.sh
   ```

2. The script will:
   - Format and create new rules for any new guidelines
   - Update existing rules if source guidelines have changed
   - Remove orphaned rules for deleted guidelines
   - Report on all changes made

## Version Control

The generated cursor rule files are git-ignored to avoid cluttering the repository:

- All `.mdc` files in this directory are excluded from git
- The `.gitkeep` file maintains the directory structure
- The `.last-sync` timestamp file is also ignored

Each developer should run the sync script locally after pulling changes to the guidelines.

## Last Sync

The `.cursor/rules/.last-sync` file contains a timestamp of when the rules were last synced with the guidelines.

## Manual Verification

To verify the rule files are properly formatted:

```bash
ls -la .cursor/rules/
```

This will show all the Cursor rule files that were generated from the original guidelines.
