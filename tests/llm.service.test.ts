import { describe, it } from 'node:test'
import assert from 'node:assert'
import { buildMessages, buildCompletionParams } from '../src/service/llm.service'
import type { OpenAIConfig } from '../src/service/llm.service'
import { LLMMessageRole } from '../src/model/llm'

describe('buildMessages - prompt caching', () => {
  it('should send system content as a plain string when caching is disabled', () => {
    const messages = buildMessages('system', 'user prompt', [])
    assert.strictEqual(messages[0].role, 'system')
    assert.strictEqual(messages[0].content, 'system')
  })

  it('should wrap system content with cache_control when caching is enabled', () => {
    const messages = buildMessages('system', 'user prompt', [], true)
    assert.strictEqual(messages[0].role, 'system')
    assert.ok(Array.isArray(messages[0].content))
    const parts = messages[0].content as any[]
    assert.strictEqual(parts.length, 1)
    assert.strictEqual(parts[0].type, 'text')
    assert.strictEqual(parts[0].text, 'system')
    assert.deepStrictEqual(parts[0].cache_control, { type: 'ephemeral' })
  })

  it('should keep history and user messages unchanged when caching is enabled', () => {
    const history = [{ role: LLMMessageRole.USER, content: 'prior' }]
    const messages = buildMessages('sys', 'now', history, true)
    assert.strictEqual(messages.length, 3)
    assert.strictEqual(messages[1].content, 'prior')
    assert.strictEqual(messages[2].content, 'now')
  })
})

describe('buildCompletionParams - JSON output enforcement', () => {
  const baseConfig: OpenAIConfig = {
    kind: 'openai',
    apiKey: 'k',
    model: 'm',
    temperature: 0
  }

  it('should not set response_format when enforceJsonOutput is off', () => {
    const params = buildCompletionParams(baseConfig, [])
    assert.strictEqual((params as any).response_format, undefined)
  })

  it('should set response_format to json_object when enforceJsonOutput is on', () => {
    const params = buildCompletionParams({ ...baseConfig, enforceJsonOutput: true }, [])
    assert.deepStrictEqual((params as any).response_format, { type: 'json_object' })
  })

  it('should default model to gpt-4o when not provided', () => {
    const params = buildCompletionParams({ kind: 'openai', apiKey: 'k' }, [])
    assert.strictEqual(params.model, 'gpt-4o')
  })
})
