---
title: Write Yargs Command-Line Scripts
type: guideline
description: Guidelines for writing command-line scripts using yargs argument parsing library
base_uri: sys:system/guideline/write-yargs.md
created_at: '2025-09-13T17:15:02.217Z'
entity_id: 51461dee-975f-4926-b7d7-9600f63cdade
observations:
  - '[parsing] Use .parse() instead of .argv for proper help output generation'
  - '[structure] Chain configuration methods before .parse() for complete option handling'
  - '[documentation] Use .usage() and .example() for clear help documentation'
public_read: true
relations:
  - implements [[sys:system/text/system-design.md]]
  - related_to [[sys:system/guideline/write-javascript.md]]
updated_at: '2026-01-05T19:25:01.718Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
visibility_analyzed_at: '2026-02-16T04:33:01.652Z'
---

# Yargs Configuration

## Argument Parsing Pattern

Scripts MUST use `.parse()` instead of `.argv` for proper help output and option handling:

```javascript
// Correct - enables proper help output
const argv = yargs(hideBin(process.argv))
  .usage('$0 [options]', 'Script description')
  .option('year', {
    type: 'number',
    describe: 'Season year to process'
  })
  .example('$0 --year 2024', 'Process data for 2024 season')
  .help()
  .parse()

// Incorrect - prevents proper help output and breaks --help
const argv = yargs(hideBin(process.argv)).option('year', {
  type: 'number',
  describe: 'Season year to process'
}).argv // This breaks help output!
```

## Required Components

All yargs scripts MUST include these in order:

1. `hideBin(process.argv)` to remove Node.js-specific arguments
2. `.usage('$0 [options]', 'Description')` for help header
3. Option definitions with proper `describe` properties
4. `.example()` calls for usage examples
5. `.help()` to enable automatic help generation
6. `.parse()` as the final method call (NOT `.argv`)

## Complete Example

```javascript
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

const argv = yargs(hideBin(process.argv))
  .usage('$0 [options]', 'Process market results using settlement system')
  .option('year', {
    type: 'number',
    describe: 'Season year to process',
    default: 2024
  })
  .option('dry_run', {
    type: 'boolean',
    default: false,
    describe: 'Preview changes without executing'
  })
  .option('batch_size', {
    type: 'number',
    default: 1000,
    describe: 'Number of items to process per batch'
  })
  .example('$0 --dry_run', 'Preview changes without writing')
  .example(
    '$0 --year 2023 --batch_size 500',
    'Process 2023 data in smaller batches'
  )
  .help()
  .parse() // CRITICAL: Use .parse() not .argv
```

## Option Configuration Best Practices

- Always specify `type` (string, number, boolean, array)
- Always provide `describe` for clear help output
- Set sensible `default` values where appropriate
- Use `array` type for multi-value options

```javascript
.option('market_types', {
  type: 'array',
  describe: 'Specific market types to process (can be repeated)',
  choices: ['PASSING_YARDS', 'RUSHING_YARDS', 'RECEIVING_YARDS']
})
```

## Common Mistakes to Avoid

1. **Using `.argv` instead of `.parse()`** - This is the most common mistake and prevents proper help output
2. **Missing `hideBin(process.argv)`** - Causes Node.js arguments to interfere
3. **No `.help()` call** - Users can't get help information
4. **Missing `describe` properties** - Help output is uninformative
5. **No usage examples** - Users don't understand how to use the script

## Testing Your Implementation

Always test that help works correctly:

```bash
node your-script.mjs --help
```

If you only see basic Node.js options, you're using `.argv` instead of `.parse()`.
