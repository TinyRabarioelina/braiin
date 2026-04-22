import { LLMAction } from "../model/llm"

export type ParseActionResult =
  | { ok: true; action: LLMAction }
  | { ok: false; error: string }

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

export const parseLLMAction = (raw: unknown): ParseActionResult => {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Response is not a JSON object' }
  }

  const obj = raw as Record<string, unknown>
  const action = asString(obj.action)

  if (!action) {
    const legacyTool = asString(obj.tool)
    if (legacyTool === 'finished') {
      const answer = asString(obj.input) ?? asString(obj.answer)
      if (answer === undefined) return { ok: false, error: 'Legacy "finished" requires string "input"' }
      return { ok: true, action: { action: 'finish', answer } }
    }
    if (legacyTool === 'none') {
      const reason = asString(obj.input) ?? asString(obj.reason) ?? 'unspecified'
      return { ok: true, action: { action: 'abort', reason } }
    }
    const legacyAgent = asString(obj.agent)
    if (legacyAgent && legacyTool) {
      return {
        ok: true,
        action: { action: 'call', agent: legacyAgent, tool: legacyTool, input: obj.input as string | Record<string, any> | undefined }
      }
    }
    return { ok: false, error: 'Missing "action" field' }
  }

  switch (action) {
    case 'describe': {
      const agent = asString(obj.agent)
      if (!agent) return { ok: false, error: '"describe" requires string "agent"' }
      return { ok: true, action: { action: 'describe', agent } }
    }
    case 'call': {
      const agent = asString(obj.agent)
      const tool = asString(obj.tool)
      if (!agent) return { ok: false, error: '"call" requires string "agent"' }
      if (!tool) return { ok: false, error: '"call" requires string "tool"' }
      return {
        ok: true,
        action: { action: 'call', agent, tool, input: obj.input as string | Record<string, any> | undefined }
      }
    }
    case 'finish': {
      const answer = asString(obj.answer) ?? asString(obj.input)
      if (answer === undefined) return { ok: false, error: '"finish" requires string "answer"' }
      return { ok: true, action: { action: 'finish', answer } }
    }
    case 'abort': {
      const reason = asString(obj.reason) ?? asString(obj.input) ?? 'unspecified'
      return { ok: true, action: { action: 'abort', reason } }
    }
    default:
      return { ok: false, error: `Unknown action: ${action}` }
  }
}
