import OpenAI from "openai"
import { LLMMessage, LLMMessageRole, LLMResponse } from "../model/llm"

export interface LLMConfig {
  apiKey: string
  serverUrl: string
  model: string
  temperature: number
  maxTokens?: number
  timeoutMs?: number
  signal?: AbortSignal
  enablePromptCaching?: boolean
}

export interface LLMService {
  ask: (
    systemPrompt: string,
    prompt: string,
    history: LLMMessage[],
    callback?: (response: string) => any
  ) => Promise<LLMResponse | undefined>
}

const STREAM_END_MARKER = '[[END]]'

const buildRequestSignal = (config: LLMConfig): AbortSignal | undefined => {
  const signals: AbortSignal[] = []
  if (config.signal) signals.push(config.signal)
  if (config.timeoutMs !== undefined) signals.push(AbortSignal.timeout(config.timeoutMs))

  if (signals.length === 0) return undefined
  if (signals.length === 1) return signals[0]
  return AbortSignal.any(signals)
}

const handleCompletion = async (
  client: OpenAI,
  config: LLMConfig,
  messages: OpenAI.ChatCompletionMessageParam[],
  signal?: AbortSignal
): Promise<LLMResponse> => {
  const completion = await client.chat.completions.create({
    model: config.model,
    messages,
    max_tokens: config.maxTokens ?? 8192,
    temperature: config.temperature
  }, { signal })

  return {
    id: completion.id,
    object: completion.object,
    created: completion.created,
    model: completion.model,
    choices: completion.choices.map(choice => ({
      index: choice.index,
      message: {
        role: choice.message.role as LLMMessageRole,
        content: choice.message.content ?? ''
      },
      finish_reason: choice.finish_reason ?? ''
    }))
  }
}

const handleStream = async (
  client: OpenAI,
  config: LLMConfig,
  messages: OpenAI.ChatCompletionMessageParam[],
  callback: (response: string) => any,
  signal?: AbortSignal
): Promise<LLMResponse> => {
  const stream = await client.chat.completions.create({
    model: config.model,
    messages,
    max_tokens: config.maxTokens ?? 8192,
    temperature: config.temperature,
    stream: true
  }, { signal })

  let buffer = ''
  let finishReason = ''
  let id = ''
  let model = config.model
  let created = 0

  for await (const chunk of stream) {
    id = chunk.id || id
    model = chunk.model || model
    created = chunk.created || created
    const delta = chunk.choices?.[0]?.delta?.content
    if (delta) {
      buffer += delta
      callback(delta)
    }
    const fr = chunk.choices?.[0]?.finish_reason
    if (fr) finishReason = fr
  }
  callback(STREAM_END_MARKER)

  return {
    id,
    object: 'chat.completion',
    created,
    model,
    choices: [{
      index: 0,
      message: { role: LLMMessageRole.ASSISTANT, content: buffer },
      finish_reason: finishReason
    }]
  }
}

export const buildMessages = (
  systemPrompt: string,
  prompt: string,
  history: LLMMessage[],
  enablePromptCaching = false
): OpenAI.ChatCompletionMessageParam[] => {
  const systemContent = enablePromptCaching
    ? [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
    : systemPrompt

  return [
    { role: 'system', content: systemContent as any },
    ...history.map(msg => ({
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content
    })),
    { role: 'user', content: prompt }
  ]
}

const describeError = (error: unknown): { message: string; type: string } => {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return { message: `Request aborted: ${error.message}`, type: 'timeout_error' }
    }
    return { message: error.message, type: 'api_error' }
  }
  return { message: 'Unknown error', type: 'api_error' }
}

export const createLLMService = (config: LLMConfig): LLMService => {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.serverUrl
  })

  return {
    ask: async (systemPrompt, prompt, history, callback?) => {
      const messages = buildMessages(systemPrompt, prompt, history, config.enablePromptCaching)
      const signal = buildRequestSignal(config)

      try {
        if (callback) {
          return await handleStream(client, config, messages, callback, signal)
        }

        return await handleCompletion(client, config, messages, signal)
      } catch (error) {
        const { message, type } = describeError(error)
        return {
          id: '',
          object: '',
          created: 0,
          model: config.model,
          choices: [],
          error: { message, type, param: '', code: '' }
        }
      }
    }
  }
}
