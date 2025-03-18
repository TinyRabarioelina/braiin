import { Tool } from "./tool";

export class Agent {
  private tools: Tool[]
  name = ''
  description = ''

  constructor(name: string, description: string, tools: Tool[]) {
    this.name = name
    this.description = description
    this.tools = tools
  }

  getTools() {
    return this.tools
  }

}