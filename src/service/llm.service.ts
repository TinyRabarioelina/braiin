import OpenAI from "openai"
import { LLMMessage, LLMMessageRole, LLMResponse } from "../model/llm"

export interface LLMConfig {
  apiKey: string
  serverUrl: string
  model: string
  temperature: number
  maxTokens?: number
}

export interface LLMService {
  ask: (
    systemPrompt: string,
    prompt: string,
    history: LLMMessage[],
    callback?: (response: string) => any
  ) => Promise<LLMResponse | undefined>
}

const handleCompletion = async (
  client: OpenAI,
  config: LLMConfig,
  messages: OpenAI.ChatCompletionMessageParam[]
): Promise<LLMResponse> => {
  const completion = await client.chat.completions.create({
    model: config.model,
    messages,
    max_tokens: config.maxTokens ?? 8192,
    temperature: config.temperature
  })

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
  callback: (response: string) => any
): Promise<undefined> => {
  const stream = await client.chat.completions.create({
    model: config.model,
    messages,
    max_tokens: config.maxTokens ?? 8192,
    temperature: config.temperature,
    stream: true
  })

  for await (const chunk of stream) {
    const text = chunk.choices?.[0]?.delta?.content
    if (text) callback(text)
  }

  callback('[[END]]')
}

const buildMessages = (
  systemPrompt: string,
  prompt: string,
  history: LLMMessage[]
): OpenAI.ChatCompletionMessageParam[] => [
  { role: 'system', content: systemPrompt },
  ...history.map(msg => ({
    role: msg.role as 'system' | 'user' | 'assistant',
    content: msg.content
  })),
  { role: 'user', content: prompt }
]

export const createLLMService = (config: LLMConfig): LLMService => {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.serverUrl
  })

  return {
    ask: async (systemPrompt, prompt, history, callback?) => {
      const messages = buildMessages(systemPrompt, prompt, history)

      try {
        if (callback) {
          return await handleStream(client, config, messages, callback)
        }

        return await handleCompletion(client, config, messages)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return {
          id: '',
          object: '',
          created: 0,
          model: config.model,
          choices: [],
          error: { message, type: 'api_error', param: '', code: '' }
        }
      }
    }
  }
}
