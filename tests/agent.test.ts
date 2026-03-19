import { describe, it } from 'node:test'
import assert from 'node:assert'
import { createAgent, findTool } from '../src/engine/agent'
import { Tool } from '../src/engine/tool'

const mockTool: Tool = {
  tag: 'test-tool',
  description: 'A test tool',
  input: 'test input',
  output: 'test output',
  call: async () => 'result'
}

describe('createAgent', () => {
  it('should create an agent with correct properties', () => {
    const agent = createAgent('my-agent', 'A test agent', [mockTool])
    assert.strictEqual(agent.name, 'my-agent')
    assert.strictEqual(agent.description, 'A test agent')
    assert.strictEqual(agent.tools.length, 1)
    assert.strictEqual(agent.tools[0].tag, 'test-tool')
  })
})

describe('findTool', () => {
  const agent = createAgent('my-agent', 'A test agent', [mockTool])

  it('should find a tool by tag', () => {
    const tool = findTool(agent, 'test-tool')
    assert.strictEqual(tool?.tag, 'test-tool')
  })

  it('should return undefined for unknown tag', () => {
    const tool = findTool(agent, 'unknown')
    assert.strictEqual(tool, undefined)
  })
})
