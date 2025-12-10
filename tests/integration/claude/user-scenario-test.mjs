import { describe, it } from 'mocha'
import { expect } from 'chai'

import { normalize_claude_session } from '#libs-server/integrations/claude/normalize-session.mjs'

describe('User Scenario Test - Claude Interrupt Message', () => {
  it('should normalize the exact user scenario as system message', () => {
    // Test data with made-up paths (not real user-base paths)
    const test_working_directory =
      '/tmp/test-user-base/repository/active/test-project/worktrees/feature-branch-name'
    const claude_session = {
      session_id: 'e491f7ab-3fbe-42d5-84d7-cbb35a46881e',
      entries: [
        {
          parentUuid: '9d9bc176-b3ef-4cd5-9516-84034bdf1a96',
          isSidechain: false,
          userType: 'external',
          cwd: test_working_directory,
          sessionId: 'e491f7ab-3fbe-42d5-84d7-cbb35a46881e',
          version: '1.0.61',
          gitBranch: 'refactor/244-separate-rankings-adp-data',
          type: 'user',
          message: {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '[Request interrupted by user]'
              }
            ]
          },
          uuid: 'cddf89db-326e-4bb8-a296-7ee36023e9cc',
          timestamp: '2025-07-26T16:48:09.704Z',
          line_number: 2,
          parse_line_number: 2
        }
      ],
      metadata: {
        cwd: test_working_directory,
        version: '1.0.61',
        user_type: 'external'
      }
    }

    const result = normalize_claude_session(claude_session)

    expect(result.messages).to.have.length(1)
    const message = result.messages[0]

    // Should be normalized as system message
    expect(message.type).to.equal('system')
    expect(message.content).to.equal('Request interrupted by user')
    expect(message.system_type).to.equal('status')

    // Should preserve metadata properly
    expect(message.metadata.original_type).to.equal('user')
    expect(message.metadata.is_interrupt).to.be.true
    expect(message.metadata.working_directory).to.equal(test_working_directory)
    expect(message.metadata.user_type).to.equal('external')
    expect(message.metadata.git_branch).to.equal(
      'refactor/244-separate-rankings-adp-data'
    )
    expect(message.metadata.parse_line_number).to.equal(2)

    // Should preserve original content for debugging
    expect(message.metadata.original_content).to.deep.equal([
      {
        type: 'text',
        text: '[Request interrupted by user]'
      }
    ])

    // Should have proper ID and timestamp
    expect(message.id).to.equal('cddf89db-326e-4bb8-a296-7ee36023e9cc')
    expect(message.timestamp).to.be.instanceOf(Date)
    expect(message.timestamp.toISOString()).to.equal('2025-07-26T16:48:09.704Z')

    // Should have provider data
    expect(message.provider_data.line_number).to.equal(2)
    expect(message.provider_data.session_index).to.equal(0)
    expect(message.provider_data.is_sidechain).to.be.false

    console.log('✓ User scenario normalized correctly as system message:', {
      type: message.type,
      content: message.content,
      system_type: message.system_type,
      is_interrupt: message.metadata.is_interrupt
    })
  })
})
