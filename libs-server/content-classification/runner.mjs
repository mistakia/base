import { load_taxonomy } from './taxonomy.mjs'
import { classify_item } from './classify.mjs'
import { parse_classification_args } from './cli-args.mjs'
import {
  ensure_classification_columns,
  load_unclassified_items
} from './database.mjs'
import { resolve_role } from '#libs-server/model-roles/resolve-role.mjs'

/**
 * Run the full classification pipeline for a content source.
 *
 * @param {object} options
 * @param {string} options.source_id - Source identifier (twitter, reddit, github)
 * @param {Array<{uri: string, table_name: string, primary_key: string, label?: string}>} options.databases
 *   Database entries to process. Each entry has uri, table_name, primary_key, and optional label.
 * @param {string} options.taxonomy_path - Absolute path to unified config JSON
 * @param {Function} options.build_prompt - (taxonomy, item) => string
 * @param {Function} options.extract_links - (item, social_media_domains) => {github_links, blog_links, external_links}
 * @param {Function} [options.get_item_preview] - (item) => string for progress display
 * @param {object} [options.arg_options] - Options for parse_classification_args
 * @param {Function} [options.filter_items] - (items, argv) => items for source-specific filtering
 */
export async function run_classification({
  source_id,
  databases,
  taxonomy_path,
  build_prompt,
  extract_links,
  get_item_preview,
  arg_options,
  filter_items
}) {
  const argv = parse_classification_args(arg_options)

  const taxonomy = load_taxonomy(taxonomy_path, source_id)
  console.log(
    `Loaded taxonomy: ${taxonomy.domains.length} domains (${taxonomy.domains.map((d) => d.tag).join(', ')})`
  )

  const resolved_model = resolve_role({ role: 'content_classifier' }).model

  const { get_database_entity } =
    await import('#libs-server/database/get-database-entity.mjs')
  const { get_storage_adapter } =
    await import('#libs-server/database/storage-adapters/index.mjs')

  const tag_counts = {}
  let total_classified = 0
  let total_errors = 0

  for (const db of databases) {
    if (databases.length > 1) {
      console.log(`\n--- ${db.label || db.table_name} ---`)
    }

    const database_entity = await get_database_entity({ base_uri: db.uri })
    if (!database_entity) {
      throw new Error(`Database entity not found: ${db.uri}`)
    }

    const adapter = await get_storage_adapter(database_entity)
    await adapter.create_table()
    await ensure_classification_columns(adapter, db.table_name)

    let items = await load_unclassified_items(adapter, argv.reclassify)

    if (argv.reclassify) {
      console.log(`Reclassify mode: processing all ${db.label || 'items'}`)
    }

    // Apply source-specific filtering
    if (filter_items) {
      items = filter_items(items, argv)
    }

    if (argv.limit && items.length > argv.limit) {
      items = items.slice(0, argv.limit)
    }

    console.log(`Found ${items.length} ${db.label || 'items'} to classify`)

    if (items.length === 0) {
      await adapter.close()
      continue
    }

    let classified_count = 0
    let error_count = 0

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const preview = get_item_preview
        ? get_item_preview(item)
        : String(item[db.primary_key]).substring(0, 60)

      process.stdout.write(`\r[${i + 1}/${items.length}] ${preview}...`)

      const links = extract_links(item, taxonomy.social_media_domains)

      let classification
      try {
        const prompt = build_prompt(taxonomy, item)
        classification = await classify_item({
          prompt,
          taxonomy
        })
      } catch (error) {
        console.error(
          `\nError classifying ${item[db.primary_key]}: ${error.message}`
        )
        error_count++
        continue
      }

      for (const tag of classification.tags) {
        tag_counts[tag] = (tag_counts[tag] || 0) + 1
      }

      if (argv.dry_run) {
        console.log(
          `\n  Tags: [${classification.tags.join(', ')}] (${classification.confidence.toFixed(2)})`
        )
        const gh = JSON.parse(links.github_links)
        const bl = JSON.parse(links.blog_links)
        if (gh.length > 0) console.log(`  GitHub: ${gh.join(', ')}`)
        if (bl.length > 0) console.log(`  Blog: ${bl.join(', ')}`)
        classified_count++
        continue
      }

      const now = new Date().toISOString()
      await adapter.update(item[db.primary_key], {
        ...item,
        domain_tags: JSON.stringify(classification.tags),
        classification_confidence: classification.confidence,
        classification_model: resolved_model,
        classified_at: now,
        github_links: links.github_links,
        blog_links: links.blog_links,
        external_links: links.external_links
      })

      classified_count++
    }

    if (items.length > 0) console.log('')
    await adapter.close()

    total_classified += classified_count
    total_errors += error_count
  }

  // Print summary
  console.log('\nClassification complete:')
  console.log(`  Processed: ${total_classified}`)
  if (total_errors > 0) {
    console.log(`  Errors: ${total_errors}`)
  }
  console.log(`  Role: content_classifier (${resolved_model})`)
  if (argv.dry_run) {
    console.log('  Mode: DRY RUN (no database changes)')
  }

  if (Object.keys(tag_counts).length > 0) {
    console.log('\nTag distribution:')
    const sorted = Object.entries(tag_counts).sort((a, b) => b[1] - a[1])
    for (const [tag, count] of sorted) {
      console.log(`  ${tag}: ${count}`)
    }
  }
}
