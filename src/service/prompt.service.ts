import { Agent } from "../engine/agent"

export const buildSystemPrompt = (agents: Agent[], optionalPrompt?: string): string => {
  const agentsSummary = JSON.stringify(
    agents.map(agent => ({
      name: agent.name,
      description: agent.description,
      tools: agent.tools.map(tl => tl.tag)
    }))
  )

  return 'You are a useful agent that the purpose is to answer questions about a specific topic.'
    + 'For that purpose you have a set of agents that are specialized in different topic in order to help you solve each task: '
    + agentsSummary + '.'
    + 'Each agent has different tools to solve one specific task, you will have to ask the dedicated agent each time what are its tools and how to use them before calling them.'
    + 'To get the agent\'s tools descriptions just send me the following json {"action": "describe","agent": "agent\'name"}.'
    + 'If you want to use a specific tool, send me the following json: {"agent":"agent\'s name","tool":"tool\'s tag","input":"tool\'s input"} and I will do the task for you.'
    + 'The input can be a simple string or a structured object depending on the tool\'s input definition.'
    + 'Loop through all this until you have the final answer.'
    + 'If you can\'t resolve the task, just send me the following json: {"tool":"none","input":"explication on why you cannot help"}.'
    + 'If you have the final answer, send me the following: {"tool":"finished","input":"the final result"}.'
    + 'Don\'t explain the process of what you are doing, just do it and always exchange json objects with me and always use the language I am using to communicate with you.'
    + (optionalPrompt || '')
}
