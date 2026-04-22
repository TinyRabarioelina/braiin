import { describe, it } from 'node:test'
import assert from 'node:assert'
import { parseLLMAction } from '../src/factory/action.factory'

describe('parseLLMAction - canonical format', () => {
  it('should parse a valid "describe" action', () => {
    const result = parseLLMAction({ action: 'describe', agent: 'a' })
    assert.strictEqual(result.ok, true)
    if (result.ok) assert.deepStrictEqual(result.action, { action: 'describe', agent: 'a' })
  })

  it('should parse a valid "call" action with string input', () => {
    const result = parseLLMAction({ action: 'call', agent: 'a', tool: 't', input: 'x' })
    assert.strictEqual(result.ok, true)
    if (result.ok) assert.deepStrictEqual(result.action, { action: 'call', agent: 'a', tool: 't', input: 'x' })
  })

  it('should parse a valid "call" action with object input', () => {
    const result = parseLLMAction({ action: 'call', agent: 'a', tool: 't', input: { path: '/x' } })
    assert.strictEqual(result.ok, true)
    if (result.ok) assert.deepStrictEqual(result.action, { action: 'call', agent: 'a', tool: 't', input: { path: '/x' } })
  })

  it('should parse a valid "finish" action', () => {
    const result = parseLLMAction({ action: 'finish', answer: 'done' })
    assert.strictEqual(result.ok, true)
    if (result.ok) assert.deepStrictEqual(result.action, { action: 'finish', answer: 'done' })
  })

  it('should parse a valid "abort" action', () => {
    const result = parseLLMAction({ action: 'abort', reason: 'no way' })
    assert.strictEqual(result.ok, true)
    if (result.ok) assert.deepStrictEqual(result.action, { action: 'abort', reason: 'no way' })
  })
})

describe('parseLLMAction - invalid inputs', () => {
  it('should reject non-object inputs', () => {
    assert.strictEqual(parseLLMAction(null).ok, false)
    assert.strictEqual(parseLLMAction('hello').ok, false)
    assert.strictEqual(parseLLMAction(42).ok, false)
  })

  it('should reject "describe" without agent', () => {
    assert.strictEqual(parseLLMAction({ action: 'describe' }).ok, false)
  })

  it('should reject "call" without tool', () => {
    assert.strictEqual(parseLLMAction({ action: 'call', agent: 'a' }).ok, false)
  })

  it('should reject "finish" without answer', () => {
    assert.strictEqual(parseLLMAction({ action: 'finish' }).ok, false)
  })

  it('should reject unknown action', () => {
    assert.strictEqual(parseLLMAction({ action: 'explode' }).ok, false)
  })

  it('should reject empty object', () => {
    assert.strictEqual(parseLLMAction({}).ok, false)
  })
})

describe('parseLLMAction - legacy format compatibility', () => {
  it('should map legacy {tool:"finished",input:"x"} to finish action', () => {
    const result = parseLLMAction({ tool: 'finished', input: 'done' })
    assert.strictEqual(result.ok, true)
    if (result.ok) assert.deepStrictEqual(result.action, { action: 'finish', answer: 'done' })
  })

  it('should map legacy {tool:"none",input:"x"} to abort action', () => {
    const result = parseLLMAction({ tool: 'none', input: 'cannot help' })
    assert.strictEqual(result.ok, true)
    if (result.ok) assert.deepStrictEqual(result.action, { action: 'abort', reason: 'cannot help' })
  })

  it('should map legacy {agent,tool,input} to call action', () => {
    const result = parseLLMAction({ agent: 'a', tool: 't', input: 'x' })
    assert.strictEqual(result.ok, true)
    if (result.ok) assert.deepStrictEqual(result.action, { action: 'call', agent: 'a', tool: 't', input: 'x' })
  })

  it('should accept "finish" with legacy "input" field', () => {
    const result = parseLLMAction({ action: 'finish', input: 'answer via legacy field' })
    assert.strictEqual(result.ok, true)
    if (result.ok) assert.deepStrictEqual(result.action, { action: 'finish', answer: 'answer via legacy field' })
  })
})
