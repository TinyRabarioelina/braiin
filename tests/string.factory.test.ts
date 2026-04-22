import { describe, it } from 'node:test'
import assert from 'node:assert'
import { extractJson } from '../src/factory/string.factory'

describe('extractJson', () => {
  it('should extract a valid JSON object', () => {
    const result = extractJson('{"tool":"finished","input":"done"}')
    assert.deepStrictEqual(result, { tool: 'finished', input: 'done' })
  })

  it('should extract JSON surrounded by text', () => {
    const result = extractJson('Here is the result: {"action":"describe","agent":"user-agent"} hope that helps')
    assert.deepStrictEqual(result, { action: 'describe', agent: 'user-agent' })
  })

  it('should extract JSON wrapped in markdown code blocks', () => {
    const result = extractJson('```json\n{"tool":"finished","input":"42"}\n```')
    assert.deepStrictEqual(result, { tool: 'finished', input: '42' })
  })

  it('should handle nested objects', () => {
    const result = extractJson('{"agent":"a","input":{"path":"/tmp","content":"hello"}}')
    assert.deepStrictEqual(result, { agent: 'a', input: { path: '/tmp', content: 'hello' } })
  })

  it('should return null for no JSON', () => {
    assert.strictEqual(extractJson('no json here'), null)
  })

  it('should return null for invalid JSON', () => {
    assert.strictEqual(extractJson('{invalid json}'), null)
  })

  it('should return null for empty string', () => {
    assert.strictEqual(extractJson(''), null)
  })

  it('should return null for unclosed braces', () => {
    assert.strictEqual(extractJson('{"tool":"test"'), null)
  })

  it('should handle strings that contain closing braces', () => {
    const result = extractJson('{"input":"this has a } inside"}')
    assert.deepStrictEqual(result, { input: 'this has a } inside' })
  })

  it('should handle strings that contain opening braces', () => {
    const result = extractJson('{"input":"this has a { inside"}')
    assert.deepStrictEqual(result, { input: 'this has a { inside' })
  })

  it('should handle escaped quotes in strings', () => {
    const result = extractJson('{"input":"she said \\"hi\\""}')
    assert.deepStrictEqual(result, { input: 'she said "hi"' })
  })

  it('should handle stringified nested JSON as an input value', () => {
    const result = extractJson('{"input":"{\\"nested\\":true}"}')
    assert.deepStrictEqual(result, { input: '{"nested":true}' })
  })

  it('should skip a fake opening brace in prose and find a real JSON later', () => {
    const result = extractJson('some { text before {"action":"finish","answer":"ok"}')
    assert.deepStrictEqual(result, { action: 'finish', answer: 'ok' })
  })

  it('should strip plain markdown fences without language', () => {
    const result = extractJson('```\n{"a":1}\n```')
    assert.deepStrictEqual(result, { a: 1 })
  })
})
