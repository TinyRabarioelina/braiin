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

export interface ToolTrace {
  tool: string
  input: string | Record<string, any>
  result: string
}

export type TaskStatus = 'success' | 'error'

export interface TaskResult {
  status: TaskStatus
  answer: string
  toolTraces: ToolTrace[]
}