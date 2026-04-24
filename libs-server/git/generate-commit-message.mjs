import debug from 'debug'

import { run_model_prompt } from '#libs-server/metadata/run-model-prompt.mjs'
import { extract_json_from_response } from '#libs-server/metadata/parse-analysis-output.mjs'
import { execute_git_command } from '#libs-server/git/execute-git-command.mjs'

const log = debug('git:generate-commit-message')

const MAX_DIFF_LENGTH = 4000

export async function generate_commit_message({ repo_path }) {
  log(`Generating commit message for ${repo_path}`)

  const { stdout: staged_diff } = await execute_git_command(
    ['diff', '--cached'],
    { cwd: repo_path }
  )

  if (!staged_diff.trim()) {
    throw new Error('No staged changes found')
  }

  const [staged_files_result, recent_commits_result] = await Promise.all([
    execute_git_command(['diff', '--cached', '--name-status'], {
      cwd: repo_path
    }),
    execute_git_command(['log', '--oneline', '-10'], { cwd: repo_path })
  ])

  const staged_files = staged_files_result.stdout.trim()
  const recent_commits = recent_commits_result.stdout.trim()

  const diff_content =
    staged_diff.length <= MAX_DIFF_LENGTH
      ? staged_diff
      : `${staged_diff.substring(0, MAX_DIFF_LENGTH)}\n\n... diff truncated. Full staged file list:\n${staged_files}`

  const prompt = `You are a commit message generator. Analyze the staged git changes below and produce a single commit message.

## Commit message rules
- Use imperative mood ("Add feature" not "Added feature")
- Maximum 72 characters for the subject line
- No trailing period
- Use lowercase for the first word after the scope prefix (e.g., "feat: add feature" not "feat: Add feature")
- Use a scope prefix with colon: feat:, fix:, refactor:, docs:, test:, chore:
- Do NOT use parenthetical scope like feat(scope): -- use only the colon prefix format
- Prefer a subject-only message. Only add a body when the change is genuinely complex and the subject alone cannot convey the intent
- Only describe changes that are actually in the staged diff. Do not infer or mention unstaged work

## Recent commits (for style reference)
${recent_commits}

## Staged files
${staged_files}

## Staged diff
${diff_content}

Respond ONLY with a JSON object: {"message": "your commit message here"}`

  log('Calling Ollama for commit message generation')
  const { output } = await run_model_prompt({ prompt })

  const parsed = extract_json_from_response(output)
  if (!parsed?.message) {
    throw new Error('Failed to parse commit message from model response')
  }

  const message = parsed.message.trim()
  log(`Generated commit message: ${message.substring(0, 72)}`)

  return message
}
