export interface Tool {
  tag: string
  description: string
  input: string
  output: string
  call: (input?: string) => Promise<string>
}