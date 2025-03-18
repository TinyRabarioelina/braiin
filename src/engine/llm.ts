export enum LLMMessageRole {
  SYSTEM = 'system',
  USER = 'user',
  ASSISTANT = 'assistant'
}

export interface LLMMessage {
  role: LLMMessageRole
  content: string
}

export interface LLMResponse {
  id: string
  object: string
  created: number
  model: string
  choices: LLMResponseChoice[]
  error?: {
    message: string
    type: string
    param: string
    code: string
  }
}

export interface LLMResponseChoice {
  index: number
  message: LLMMessage
  finish_reason: string
}