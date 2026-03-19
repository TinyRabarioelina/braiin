export interface ToolParameter {
  name: string
  description: string
  required?: boolean
}

export type ToolInput = string | Record<string, any>

export interface Tool {
  tag: string
  description: string
  input: string | ToolParameter[]
  output: string
  call: (input?: ToolInput) => Promise<string>
}