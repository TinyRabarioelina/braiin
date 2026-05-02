import { parseLLMAction } from "../factory/action.factory"
import { extractJson } from "../factory/string.factory"
import { LLMAction, LLMMessage, LLMMessageRole, LLMResponse, TaskResult, ToolTrace } from "../model/llm"
import { createLLMService, LLMConfig, LLMService } from "../service/llm.service"
import { buildSystemPrompt } from "../service/prompt.service"
import { freeze } from "../service/timer"
import { Agent, findTool } from "./agent"

const DEFAULT_MAX_STEPS = 50
const DEFAULT_TIMEOUT_MS = 60000
const DEFAULT_SERVER_URL = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'gpt-4o'
const DEFAULT_TEMPERATURE = 0

export type LLMBackend = 'openai' | 'claude-code'

export interface OrchestratorConfig {
  backend?: LLMBackend
  optionalPrompt?: string
  stepsInterval?: number
  maxSteps?: number
  timeoutMs?: number
  signal?: AbortSignal
  llmService?: LLMService

  apiKey?: string
  serverUrl?: string
  model?: string
  temperature?: number
  maxTokens?: number
  enablePromptCaching?: boolean
  enforceJsonOutput?: boolean

  sessionId?: string
  cliPath?: string
}

export interface Orchestrator {
  executeTask: (prompt: string, history?: LLMMessage[], toolTraces?: ToolTrace[], logCallback?: (log: string) => void) => Promise<TaskResult>
  askLLM: (systemPrompt: string, prompt: string, history?: LLMMessage[], logCallback?: (log: string) => void) => Promise<LLMResponse | undefined>
}

interface ChainContext {
  agents: Agent[]
  llm: LLMService
  globalContext: string
  maxSteps: number
  stepsInterval?: number
  logCallback?: (log: string) => void
}

const buildLLMConfig = (config: OrchestratorConfig): LLMConfig => {
  const backend: LLMBackend = config.backend ?? 'openai'

  if (backend === 'claude-code') {
    if (!config.sessionId) {
      throw new Error('OrchestratorConfig.sessionId is required when backend is "claude-code"')
    }
    return {
      kind: 'claude-code',
      sessionId: config.sessionId,
      cliPath: config.cliPath,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      signal: config.signal
    }
  }

  if (!config.apiKey) {
    throw new Error('OrchestratorConfig.apiKey is required when backend is "openai"')
  }
  return {
    kind: 'openai',
    apiKey: config.apiKey,
    serverUrl: config.serverUrl ?? DEFAULT_SERVER_URL,
    model: config.model ?? DEFAULT_MODEL,
    temperature: config.temperature ?? DEFAULT_TEMPERATURE,
    maxTokens: config.maxTokens,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    signal: config.signal,
    enablePromptCaching: config.enablePromptCaching,
    enforceJsonOutput: config.enforceJsonOutput
  }
}

const runLLM = async (
  ctx: ChainContext,
  prompt: string,
  history: LLMMessage[]
): Promise<LLMResponse | undefined> => {
  return ctx.logCallback
    ? ctx.llm.ask(ctx.globalContext, prompt, history, ctx.logCallback)
    : ctx.llm.ask(ctx.globalContext, prompt, history)
}

const chain = async (
  prompt: string,
  history: LLMMessage[],
  toolTraces: ToolTrace[],
  step: number,
  ctx: ChainContext
): Promise<TaskResult> => {
  if (step >= ctx.maxSteps) {
    ctx.logCallback?.('Max steps reached')
    return { status: 'error', answer: 'Max steps reached', toolTraces }
  }

  if (ctx.stepsInterval) await freeze(ctx.stepsInterval)

  const answer = await runLLM(ctx, prompt, history)
  if (answer?.error) {
    return { status: 'error', answer: `An error occured when calling the LLM: ${answer.error.message}`, toolTraces }
  }

  const raw = answer?.choices[0]?.message.content?.trim() ?? ''
  if (!raw) {
    ctx.logCallback?.('LLM returned an empty response')
    return { status: 'error', answer: 'LLM returned an empty response', toolTraces }
  }

  ctx.logCallback?.(raw)

  const parsed = extractJson(raw)
  if (!parsed) {
    return { status: 'error', answer: 'Data in wrong format: ' + raw, toolTraces }
  }

  const validation = parseLLMAction(parsed)
  if (!validation.ok) {
    return { status: 'error', answer: `Invalid action: ${validation.error}. Raw: ${raw}`, toolTraces }
  }

  return dispatch(validation.action, raw, prompt, history, toolTraces, step + 1, ctx)
}

const dispatch = async (
  action: LLMAction,
  raw: string,
  prompt: string,
  history: LLMMessage[],
  toolTraces: ToolTrace[],
  nextStep: number,
  ctx: ChainContext
): Promise<TaskResult> => {
  const chainNext = (nextPrompt: string, nextHistory: LLMMessage[]) =>
    chain(nextPrompt, nextHistory, toolTraces, nextStep, ctx)

  switch (action.action) {
    case 'finish':
      return { status: 'success', answer: action.answer, toolTraces }

    case 'abort':
      return { status: 'error', answer: action.reason, toolTraces }

    case 'describe': {
      const agent = ctx.agents.find(a => a.name === action.agent)
      if (!agent) {
        ctx.logCallback?.('No matching agent found for this task')
        return { status: 'error', answer: 'No matching agent found for this task', toolTraces }
      }
      return chainNext(
        JSON.stringify(agent.tools),
        [
          ...history,
          { role: LLMMessageRole.USER, content: prompt },
          { role: LLMMessageRole.ASSISTANT, content: raw }
        ]
      )
    }

    case 'call': {
      const agent = ctx.agents.find(a => a.name === action.agent)
      if (!agent) {
        ctx.logCallback?.('No matching agent found for this task')
        return { status: 'error', answer: 'No matching agent found for this task', toolTraces }
      }

      const tool = findTool(agent, action.tool)
      if (!tool) {
        ctx.logCallback?.('No matching tool found for this task')
        return { status: 'error', answer: 'No matching tool found for this task', toolTraces }
      }

      let toolResponse: string
      try {
        toolResponse = await tool.call(action.input)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown tool error'
        ctx.logCallback?.(`Tool "${action.tool}" failed: ${message}`)
        return { status: 'error', answer: `Tool "${action.tool}" failed: ${message}`, toolTraces }
      }

      toolTraces.push({ tool: action.tool, input: action.input ?? '', result: toolResponse })

      return chainNext(
        toolResponse,
        [
          ...history,
          { role: LLMMessageRole.USER, content: prompt },
          { role: LLMMessageRole.ASSISTANT, content: raw },
          { role: LLMMessageRole.USER, content: `tool response: ${toolResponse}` }
        ]
      )
    }
  }
}

export const createOrchestrator = (agents: Agent[], config: OrchestratorConfig): Orchestrator => {
  const maxSteps = config.maxSteps ?? DEFAULT_MAX_STEPS
  const globalContext = buildSystemPrompt(agents, config.optionalPrompt)
  const llm = config.llmService ?? createLLMService(buildLLMConfig(config))

  return {
    executeTask: async (prompt, history?, toolTraces?, logCallback?) => {
      const contextHistory = [...(history || [])]

      if (toolTraces?.length) {
        contextHistory.unshift({
          role: LLMMessageRole.SYSTEM,
          content: 'Known context from previous interactions: ' + JSON.stringify(toolTraces)
        })
      }

      const ctx: ChainContext = {
        agents,
        llm,
        globalContext,
        maxSteps,
        stepsInterval: config.stepsInterval,
        logCallback
      }

      return chain(prompt, contextHistory, [...(toolTraces || [])], 0, ctx)
    },

    askLLM: async (systemPrompt, prompt, history?, logCallback?) => {
      return llm.ask(systemPrompt, prompt, history || [], logCallback)
    }
  }
}
