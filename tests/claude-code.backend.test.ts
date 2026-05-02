import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  buildClaudeCodeArgs,
  parseClaudeCodeJsonOutput,
  createClaudeCodeBackend
} from '../src/service/claude-code.backend'

describe('buildClaudeCodeArgs', () => {
  it('should include print, session ID, system prompt, empty tools, and JSON output', () => {
    const args = buildClaudeCodeArgs(
      { kind: 'claude-code', sessionId: 'abc-123' },
      'You are a helpful agent.',
      'What is the weather?'
    )

    assert.ok(args.includes('-p'))
    assert.strictEqual(args[args.indexOf('--session-id') + 1], 'abc-123')
    assert.strictEqual(args[args.indexOf('--system-prompt') + 1], 'You are a helpful agent.')
    assert.strictEqual(args[args.indexOf('--tools') + 1], '')
    assert.strictEqual(args[args.indexOf('--output-format') + 1], 'json')
    assert.strictEqual(args[args.length - 1], 'What is the weather?')
  })

  it('should pass empty string for --tools to disable all tools', () => {
    const args = buildClaudeCodeArgs(
      { kind: 'claude-code', sessionId: 'sid' },
      'sys',
      'q'
    )
    const toolsIndex = args.indexOf('--tools')
    assert.notStrictEqual(toolsIndex, -1)
    assert.strictEqual(args[toolsIndex + 1], '')
  })
})

describe('parseClaudeCodeJsonOutput', () => {
  it('should parse a successful JSON response into LLMResponse', () => {
    const stdout = JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'Paris is the capital.',
      session_id: 'sid-1',
      stop_reason: 'end_turn'
    })

    const response = parseClaudeCodeJsonOutput(stdout)
    assert.strictEqual(response.error, undefined)
    assert.strictEqual(response.choices.length, 1)
    assert.strictEqual(response.choices[0].message.content, 'Paris is the capital.')
    assert.strictEqual(response.choices[0].finish_reason, 'end_turn')
    assert.strictEqual(response.id, 'sid-1')
    assert.strictEqual(response.model, 'claude-code')
  })

  it('should return an error LLMResponse when is_error is true', () => {
    const stdout = JSON.stringify({
      is_error: true,
      result: 'Session not found'
    })

    const response = parseClaudeCodeJsonOutput(stdout)
    assert.ok(response.error)
    assert.ok(response.error?.message.includes('Session not found'))
    assert.strictEqual(response.error?.type, 'cli_error')
    assert.strictEqual(response.choices.length, 0)
  })

  it('should return a parse_error when stdout is not valid JSON', () => {
    const response = parseClaudeCodeJsonOutput('not json at all')
    assert.ok(response.error)
    assert.strictEqual(response.error?.type, 'parse_error')
  })

  it('should return a cli_error when stdout is empty/whitespace', () => {
    const response = parseClaudeCodeJsonOutput('   \n  ')
    assert.ok(response.error)
    assert.strictEqual(response.error?.type, 'cli_error')
  })

  it('should default finish_reason to "stop" when stop_reason is absent', () => {
    const response = parseClaudeCodeJsonOutput(JSON.stringify({ result: 'ok' }))
    assert.strictEqual(response.choices[0].finish_reason, 'stop')
  })

  it('should expose empty content when result is missing', () => {
    const response = parseClaudeCodeJsonOutput(JSON.stringify({}))
    assert.strictEqual(response.choices[0].message.content, '')
  })
})

describe('createClaudeCodeBackend', () => {
  it('should return an error LLMResponse when the CLI binary does not exist', async () => {
    const service = createClaudeCodeBackend({
      kind: 'claude-code',
      sessionId: 'test-sid',
      cliPath: '/nonexistent/path/to/claude-binary'
    })

    const response = await service.ask('sys', 'prompt', [])
    assert.ok(response)
    assert.ok(response.error)
    assert.strictEqual(response.error?.type, 'cli_error')
    assert.strictEqual(response.choices.length, 0)
  })

  it('should ignore the history argument (Claude Code maintains its own session)', async () => {
    const service = createClaudeCodeBackend({
      kind: 'claude-code',
      sessionId: 'test-sid',
      cliPath: '/nonexistent/path'
    })

    const response = await service.ask(
      'sys',
      'prompt',
      [{ role: 'user' as any, content: 'should be ignored' }]
    )
    assert.ok(response?.error)
  })
})
