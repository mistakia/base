import { expect } from 'chai'

import { normalize_claude_session } from '#libs-server/integrations/claude/normalize-session.mjs'

const session_id = 'aaaa1111-bbbb-2222-cccc-333333333333'

const wrap = (entries) =>
  normalize_claude_session({
    session_id,
    entries,
    metadata: {}
  })

describe('claude normalize-session unsupported-type materialization', () => {
  it('materializes queue-operation enqueue with content + preserves UI routing key', () => {
    const result = wrap([
      {
        type: 'queue-operation',
        operation: 'enqueue',
        content: 'pending prompt body',
        timestamp: '2026-04-17T05:00:00.000Z',
        sessionId: session_id,
        line_number: 3
      }
    ])
    expect(result.messages).to.have.lengthOf(1)
    const e = result.messages[0]
    expect(e.id).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(e.type).to.equal('system')
    expect(e.system_type).to.equal('status')
    expect(e.content).to.equal('pending prompt body')
    expect(e.metadata).to.include({
      queue_operation: 'enqueue',
      original_type: 'queue-operation',
      unsupported_message_type: 'queue-operation'
    })
  })

  it('materializes queue-operation dequeue without content with descriptive label', () => {
    const result = wrap([
      {
        type: 'queue-operation',
        operation: 'dequeue',
        timestamp: '2026-04-17T05:00:00.000Z',
        sessionId: session_id,
        line_number: 1
      }
    ])
    expect(result.messages[0].content).to.equal('Queue dequeue')
    expect(result.messages[0].metadata.queue_operation).to.equal('dequeue')
  })

  it('materializes file-history-snapshot with summary metadata only', () => {
    const result = wrap([
      {
        type: 'file-history-snapshot',
        messageId: 'msg-1',
        snapshot: {
          messageId: 'msg-1',
          trackedFileBackups: { 'a.txt': {}, 'b.txt': {} }
        },
        isSnapshotUpdate: false,
        timestamp: '2026-04-17T05:00:00.000Z',
        line_number: 4
      }
    ])
    const e = result.messages[0]
    expect(e.system_type).to.equal('status')
    expect(e.metadata).to.deep.include({
      original_type: 'file-history-snapshot',
      snapshot_message_id: 'msg-1',
      is_snapshot_update: false,
      file_count: 2
    })
    // raw trackedFileBackups must NOT leak into the canonical entry
    expect(JSON.stringify(e)).to.not.include('trackedFileBackups')
  })

  it('materializes permission-mode as system/configuration', () => {
    const result = wrap([
      {
        type: 'permission-mode',
        permissionMode: 'bypassPermissions',
        timestamp: '2026-04-17T05:00:00.000Z',
        line_number: 2
      }
    ])
    const e = result.messages[0]
    expect(e.system_type).to.equal('configuration')
    expect(e.content).to.equal('Permission mode: bypassPermissions')
    expect(e.metadata.permission_mode).to.equal('bypassPermissions')
  })

  it('materializes attachment as deferred_tools_delta summary', () => {
    const result = wrap([
      {
        type: 'attachment',
        attachment: {
          type: 'deferred_tools_delta',
          addedNames: ['a', 'b', 'c'],
          removedNames: ['x']
        },
        timestamp: '2026-04-17T05:00:00.000Z',
        line_number: 5
      }
    ])
    const e = result.messages[0]
    expect(e.system_type).to.equal('configuration')
    expect(e.metadata).to.deep.include({
      original_type: 'attachment',
      attachment_type: 'deferred_tools_delta',
      added_tool_count: 3,
      removed_tool_count: 1
    })
  })

  it('materializes last-prompt with the prompt text as content', () => {
    const result = wrap([
      {
        type: 'last-prompt',
        lastPrompt: 'Continue plz',
        timestamp: '2026-04-17T05:00:00.000Z',
        line_number: 6
      }
    ])
    const e = result.messages[0]
    expect(e.system_type).to.equal('status')
    expect(e.content).to.equal('Continue plz')
    expect(e.metadata.original_type).to.equal('last-prompt')
  })

  it('materializes custom-title as session-title configuration entry', () => {
    const result = wrap([
      {
        type: 'custom-title',
        customTitle: 'My session',
        timestamp: '2026-04-17T05:00:00.000Z',
        line_number: 7
      }
    ])
    const e = result.messages[0]
    expect(e.system_type).to.equal('configuration')
    expect(e.content).to.equal('Session title: My session')
    expect(e.metadata).to.deep.include({
      original_type: 'custom-title',
      title: 'My session'
    })
  })

  it('keeps progress events skipped (high-volume streaming partials)', () => {
    const result = wrap([
      {
        type: 'progress',
        data: { type: 'bash_progress' },
        timestamp: '2026-04-17T05:00:00.000Z',
        line_number: 8
      }
    ])
    expect(result.messages).to.have.lengthOf(0)
  })

  it('produces deterministic ids on repeated normalization (idempotent re-import)', () => {
    const entries = [
      {
        type: 'queue-operation',
        operation: 'enqueue',
        content: 'hi',
        timestamp: '2026-04-17T05:00:00.000Z',
        line_number: 1
      },
      {
        type: 'permission-mode',
        permissionMode: 'bypassPermissions',
        timestamp: '2026-04-17T05:00:01.000Z',
        line_number: 2
      }
    ]
    const a = wrap(entries).messages.map((m) => m.id)
    const b = wrap(entries).messages.map((m) => m.id)
    expect(a).to.deep.equal(b)
    expect(new Set(a).size).to.equal(a.length)
  })

  it('default arm uses entry.uuid when present, falls back to deterministic id otherwise', () => {
    const with_uuid = wrap([
      {
        type: 'novel-future-type',
        uuid: 'fixed-uuid-1',
        timestamp: '2026-04-17T05:00:00.000Z',
        line_number: 1
      }
    ])
    expect(with_uuid.messages[0].id).to.equal('fixed-uuid-1')

    const without_uuid_a = wrap([
      {
        type: 'novel-future-type',
        timestamp: '2026-04-17T05:00:00.000Z',
        line_number: 1
      }
    ])
    const without_uuid_b = wrap([
      {
        type: 'novel-future-type',
        timestamp: '2026-04-17T05:00:00.000Z',
        line_number: 1
      }
    ])
    expect(without_uuid_a.messages[0].id).to.equal(
      without_uuid_b.messages[0].id
    )
    expect(without_uuid_a.messages[0].id).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })
})
