import { extractJson } from "../factory/string.factory"
import { LLMMessage, LLMMessageRole, LLMResponse, TaskResult, ToolTrace } from "../model/llm"
import { createLLMService, LLMService } from "../service/llm.service"
import { buildSystemPrompt } from "../service/prompt.service"
import { freeze } from "../service/timer"
import { Agent, findTool } from "./agent"

const DEFAULT_MAX_STEPS = 50

export interface OrchestratorConfig {
  optionalPrompt?: string
  temperature?: number
  apiKey: string
  serverUrl?: string
  model?: string
  stepsInterval?: number
  maxSteps?: number
  llmService?: LLMService
}

export interface Orchestrator {
  executeTask: (prompt: string, history?: LLMMessage[], toolTraces?: ToolTrace[], logCallback?: (log: string) => void) => Promise<TaskResult>
  askLLM: (systemPrompt: string, prompt: string, history?: LLMMessage[], logCallback?: (log: string) => void) => Promise<LLMResponse | undefined>
}

interface ParsedResponse {
  action?: string
  agent?: string
  tool?: string
  input?: string | Record<string, any>
}

const chain = async (
  prompt: string,
  history: LLMMessage[],
  toolTraces: ToolTrace[],
  step: number,
  agents: Agent[],
  llm: LLMService,
  globalContext: string,
  maxSteps: number,
  stepsInterval?: number,
  logCallback?: (log: string) => void
): Promise<TaskResult> => {
  if (step >= maxSteps) {
    logCallback && logCallback('Max steps reached')
    return { status: 'error', answer: 'Max steps reached', toolTraces }
  }

  stepsInterval && await freeze(stepsInterval)
  const answer = await llm.ask(globalContext, prompt, history)
  if (answer?.error) {
    return { status: 'error', answer: `An error occured when calling the LLM: ${answer.error.message}`, toolTraces }
  }

  const actualResponse = answer?.choices[0]?.message.content?.trim() ?? ''
  logCallback && logCallback(actualResponse)

  const parsed = extractJson(actualResponse) as ParsedResponse | null
  if (!parsed) {
    return { status: 'error', answer: 'Data in wrong format: ' + actualResponse, toolTraces }
  }

  const { action, agent: agentName, tool: toolTag, input } = parsed
  const nextStep = step + 1
  const chainNext = (nextPrompt: string, nextHistory: LLMMessage[]) =>
    chain(nextPrompt, nextHistory, toolTraces, nextStep, agents, llm, globalContext, maxSteps, stepsInterval, logCallback)

  if (action === 'describe') {
    return handleDescribe(agentName, actualResponse, prompt, history, agents, chainNext, toolTraces, logCallback)
  }

  if (agentName) {
    return handleToolCall(agentName, toolTag, input, actualResponse, prompt, history, agents, chainNext, toolTraces, logCallback)
  }

  return { status: 'success', answer: input as string, toolTraces }
}

const handleDescribe = async (
  agentName: string | undefined,
  actualResponse: string,
  prompt: string,
  history: LLMMessage[],
  agents: Agent[],
  chainNext: (prompt: string, history: LLMMessage[]) => Promise<TaskResult>,
  toolTraces: ToolTrace[],
  logCallback?: (log: string) => void
): Promise<TaskResult> => {
  const agent = agents.find(a => a.name === agentName)
  if (!agent) {
    logCallback && logCallback('No matching agent found for this task')
    return { status: 'error', answer: 'No matching agent found for this task', toolTraces }
  }

  return chainNext(
    JSON.stringify(agent.tools),
    [
      ...history,
      { role: LLMMessageRole.USER, content: prompt },
      { role: LLMMessageRole.ASSISTANT, content: actualResponse },
    ]
  )
}

const handleToolCall = async (
  agentName: string,
  toolTag: string | undefined,
  input: string | Record<string, any> | undefined,
  actualResponse: string,
  prompt: string,
  history: LLMMessage[],
  agents: Agent[],
  chainNext: (prompt: string, history: LLMMessage[]) => Promise<TaskResult>,
  toolTraces: ToolTrace[],
  logCallback?: (log: string) => void
): Promise<TaskResult> => {
  const agent = agents.find(a => a.name === agentName)
  if (!agent) {
    logCallback && logCallback('No matching agent found for this task')
    return { status: 'error', answer: 'No matching agent found for this task', toolTraces }
  }

  const tool = findTool(agent, toolTag ?? '')
  if (!tool) {
    logCallback && logCallback('No matching tool found for this task')
    return { status: 'error', answer: 'No matching tool found for this task', toolTraces }
  }

  let toolResponse: string
  try {
    toolResponse = await tool.call(input)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown tool error'
    logCallback && logCallback(`Tool "${toolTag}" failed: ${message}`)
    return { status: 'error', answer: `Tool "${toolTag}" failed: ${message}`, toolTraces }
  }

  toolTraces.push({ tool: toolTag!, input: input ?? '', result: toolResponse })

  return chainNext(
    toolResponse,
    [
      ...history,
      { role: LLMMessageRole.USER, content: prompt },
      { role: LLMMessageRole.ASSISTANT, content: actualResponse },
      { role: LLMMessageRole.USER, content: `tool response: ${toolResponse}` }
    ]
  )
}

export const createOrchestrator = (agents: Agent[], config: OrchestratorConfig): Orchestrator => {
  const maxSteps = config.maxSteps ?? DEFAULT_MAX_STEPS
  const stepsInterval = config.stepsInterval
  const globalContext = buildSystemPrompt(agents, config.optionalPrompt)
  const llm = config.llmService ?? createLLMService({
    apiKey: config.apiKey,
    serverUrl: config.serverUrl ?? 'https://api.openai.com/v1',
    model: config.model ?? 'gpt-4o',
    temperature: config.temperature ?? 0
  })

  return {
    executeTask: async (prompt, history?, toolTraces?, logCallback?) => {
      const contextHistory = [...(history || [])]

      if (toolTraces?.length) {
        contextHistory.unshift({
          role: LLMMessageRole.SYSTEM,
          content: 'Known context from previous interactions: ' + JSON.stringify(toolTraces)
        })
      }

      return chain(prompt, contextHistory, [], 0, agents, llm, globalContext, maxSteps, stepsInterval, logCallback)
    },

    askLLM: async (systemPrompt, prompt, history?, logCallback?) => {
      return llm.ask(systemPrompt, prompt, history || [], logCallback)
    }
  }
}
