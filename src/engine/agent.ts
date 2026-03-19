import { Tool } from "./tool"

export interface Agent {
  name: string
  description: string
  tools: Tool[]
}

export const createAgent = (name: string, description: string, tools: Tool[]): Agent => ({
  name,
  description,
  tools
})

export const findTool = (agent: Agent, tag: string): Tool | undefined =>
  agent.tools.find(t => t.tag === tag)
