import { LLMMessage, LLMResponse } from "../model/llm"
import { OpenAIConfig, createOpenAIBackend } from "./openai.backend"
import { ClaudeCodeConfig, createClaudeCodeBackend } from "./claude-code.backend"

export type LLMConfig = OpenAIConfig | ClaudeCodeConfig

export interface LLMService {
  ask: (
    systemPrompt: string,
    prompt: string,
    history: LLMMessage[],
    callback?: (response: string) => any
  ) => Promise<LLMResponse | undefined>
}

export const createLLMService = (config: LLMConfig): LLMService => {
  switch (config.kind) {
    case 'openai': return createOpenAIBackend(config)
    case 'claude-code': return createClaudeCodeBackend(config)
  }
}

export { buildMessages, buildCompletionParams } from "./openai.backend"
export type { OpenAIConfig } from "./openai.backend"
export type { ClaudeCodeConfig } from "./claude-code.backend"
