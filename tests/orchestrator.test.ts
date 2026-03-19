import { describe, it } from 'node:test'
import assert from 'node:assert'
import { createOrchestrator } from '../src/engine/orchestrator'
import { createAgent } from '../src/engine/agent'
import { LLMService } from '../src/service/llm.service'
import { LLMMessageRole, LLMResponse } from '../src/model/llm'
import { Tool } from '../src/engine/tool'

const mockLLMResponse = (content: string): LLMResponse => ({
  id: 'test',
  object: 'chat.completion',
  created: 0,
  model: 'test',
  choices: [{
    index: 0,
    message: { role: LLMMessageRole.ASSISTANT, content },
    finish_reason: 'stop'
  }]
})

const createMockLLM = (responses: string[]): LLMService => {
  let callIndex = 0
  return {
    ask: async () => {
      const response = responses[callIndex] ?? responses[responses.length - 1]
      callIndex++
      return mockLLMResponse(response)
    }
  }
}

const echoTool: Tool = {
  tag: 'echo',
  description: 'Echoes the input',
  input: 'any string',
  output: 'the same string',
  call: async (input) => `echoed: ${input}`
}

const failingTool: Tool = {
  tag: 'failing',
  description: 'Always fails',
  input: 'anything',
  output: 'nothing',
  call: async () => { throw new Error('tool exploded') }
}

const structuredTool: Tool = {
  tag: 'write-file',
  description: 'Writes a file',
  input: [
    { name: 'path', description: 'file path', required: true },
    { name: 'content', description: 'file content', required: true }
  ],
  output: 'confirmation',
  call: async (input) => {
    const { path, content } = input as Record<string, string>
    return `wrote ${content.length} chars to ${path}`
  }
}

describe('orchestrator - executeTask', () => {
  it('should return a direct answer when LLM responds with finished', async () => {
    const agent = createAgent('test-agent', 'A test agent', [echoTool])
    const llm = createMockLLM(['{"tool":"finished","input":"The answer is 42"}'])
    const orchestrator = createOrchestrator([agent], { apiKey: 'test', llmService: llm })

    const result = await orchestrator.executeTask('What is the answer?')
    assert.strictEqual(result.status, 'success')
    assert.strictEqual(result.answer, 'The answer is 42')
    assert.strictEqual(result.toolTraces.length, 0)
  })

  it('should call a tool and return the final answer', async () => {
    const agent = createAgent('test-agent', 'A test agent', [echoTool])
    const llm = createMockLLM([
      '{"action":"describe","agent":"test-agent"}',
      '{"agent":"test-agent","tool":"echo","input":"hello"}',
      '{"tool":"finished","input":"echoed: hello"}'
    ])
    const orchestrator = createOrchestrator([agent], { apiKey: 'test', llmService: llm })

    const result = await orchestrator.executeTask('Echo hello')
    assert.strictEqual(result.status, 'success')
    assert.strictEqual(result.answer, 'echoed: hello')
    assert.strictEqual(result.toolTraces.length, 1)
    assert.strictEqual(result.toolTraces[0].tool, 'echo')
    assert.strictEqual(result.toolTraces[0].input, 'hello')
    assert.strictEqual(result.toolTraces[0].result, 'echoed: hello')
  })

  it('should handle structured tool input', async () => {
    const agent = createAgent('file-agent', 'Handles files', [structuredTool])
    const llm = createMockLLM([
      '{"agent":"file-agent","tool":"write-file","input":{"path":"/tmp/test.txt","content":"hello world"}}',
      '{"tool":"finished","input":"wrote 11 chars to /tmp/test.txt"}'
    ])
    const orchestrator = createOrchestrator([agent], { apiKey: 'test', llmService: llm })

    const result = await orchestrator.executeTask('Write hello world to /tmp/test.txt')
    assert.strictEqual(result.status, 'success')
    assert.strictEqual(result.answer, 'wrote 11 chars to /tmp/test.txt')
    assert.deepStrictEqual(result.toolTraces[0].input, { path: '/tmp/test.txt', content: 'hello world' })
  })

  it('should return error when tool throws', async () => {
    const agent = createAgent('test-agent', 'A test agent', [failingTool])
    const llm = createMockLLM([
      '{"agent":"test-agent","tool":"failing","input":"boom"}'
    ])
    const orchestrator = createOrchestrator([agent], { apiKey: 'test', llmService: llm })

    const result = await orchestrator.executeTask('Do something')
    assert.strictEqual(result.status, 'error')
    assert.ok(result.answer.includes('tool exploded'))
  })

  it('should return error when agent not found', async () => {
    const agent = createAgent('test-agent', 'A test agent', [echoTool])
    const llm = createMockLLM([
      '{"action":"describe","agent":"unknown-agent"}'
    ])
    const orchestrator = createOrchestrator([agent], { apiKey: 'test', llmService: llm })

    const result = await orchestrator.executeTask('Do something')
    assert.strictEqual(result.status, 'error')
    assert.ok(result.answer.includes('No matching agent'))
  })

  it('should return error when tool not found', async () => {
    const agent = createAgent('test-agent', 'A test agent', [echoTool])
    const llm = createMockLLM([
      '{"agent":"test-agent","tool":"unknown-tool","input":"test"}'
    ])
    const orchestrator = createOrchestrator([agent], { apiKey: 'test', llmService: llm })

    const result = await orchestrator.executeTask('Do something')
    assert.strictEqual(result.status, 'error')
    assert.ok(result.answer.includes('No matching tool'))
  })

  it('should return error when LLM returns invalid format', async () => {
    const agent = createAgent('test-agent', 'A test agent', [echoTool])
    const llm = createMockLLM(['This is not JSON at all'])
    const orchestrator = createOrchestrator([agent], { apiKey: 'test', llmService: llm })

    const result = await orchestrator.executeTask('Do something')
    assert.strictEqual(result.status, 'error')
    assert.ok(result.answer.includes('Data in wrong format'))
  })

  it('should return error when LLM returns an error', async () => {
    const llm: LLMService = {
      ask: async () => ({
        id: '', object: '', created: 0, model: 'test', choices: [],
        error: { message: 'rate limited', type: 'error', param: '', code: '429' }
      })
    }
    const agent = createAgent('test-agent', 'A test agent', [echoTool])
    const orchestrator = createOrchestrator([agent], { apiKey: 'test', llmService: llm })

    const result = await orchestrator.executeTask('Do something')
    assert.strictEqual(result.status, 'error')
    assert.ok(result.answer.includes('rate limited'))
  })

  it('should stop at maxSteps', async () => {
    const agent = createAgent('test-agent', 'A test agent', [echoTool])
    const llm = createMockLLM([
      '{"agent":"test-agent","tool":"echo","input":"loop"}'
    ])
    const orchestrator = createOrchestrator([agent], { apiKey: 'test', llmService: llm, maxSteps: 3 })

    const result = await orchestrator.executeTask('Loop forever')
    assert.strictEqual(result.status, 'error')
    assert.ok(result.answer.includes('Max steps reached'))
  })

  it('should inject previous toolTraces as context', async () => {
    let receivedHistory: any[] = []
    const llm: LLMService = {
      ask: async (_sys, _prompt, history) => {
        receivedHistory = history
        return mockLLMResponse('{"tool":"finished","input":"done"}')
      }
    }
    const agent = createAgent('test-agent', 'A test agent', [echoTool])
    const orchestrator = createOrchestrator([agent], { apiKey: 'test', llmService: llm })

    const previousTraces = [{ tool: 'echo', input: 'hello', result: 'echoed: hello' }]
    await orchestrator.executeTask('Follow up question', [], previousTraces)

    assert.ok(receivedHistory.length > 0)
    assert.ok(receivedHistory[0].content.includes('Known context'))
    assert.ok(receivedHistory[0].content.includes('echoed: hello'))
  })

  it('should extract JSON even when surrounded by text', async () => {
    const agent = createAgent('test-agent', 'A test agent', [echoTool])
    const llm = createMockLLM([
      'Sure, here you go: {"tool":"finished","input":"extracted"} hope that helps!'
    ])
    const orchestrator = createOrchestrator([agent], { apiKey: 'test', llmService: llm })

    const result = await orchestrator.executeTask('Test')
    assert.strictEqual(result.status, 'success')
    assert.strictEqual(result.answer, 'extracted')
  })
})
