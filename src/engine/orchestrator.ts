import { removeInfoStrings } from "../factory/string.factory";
import { Agent } from "./agent";
import { LLMMessage, LLMMessageRole, LLMResponse } from "./llm";

interface OrchestatorConfig {
  optionalPrompt?: string
  temperature?: number
  apiKey: string
  serverUrl: string
  model: string
}

export type LLMQuestioner = (
  systemPrompt: string,
  prompt: string,
  history: LLMMessage[],
  callback?: (response: string) => any
) => Promise<LLMResponse | undefined>

export class Orchestrator {
  private agents: Agent[]
  private globalContext = ''
  private questioner: LLMQuestioner

  constructor(agents: Agent[], config: OrchestatorConfig) {
    const { optionalPrompt, temperature, apiKey, serverUrl, model } = config
    this.questioner = async (
      systemPrompt: string,
      prompt: string,
      history: LLMMessage[],
      callback?: (response: string) => any
    ) => {
      const response = await fetch(serverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            ...history,
            {
              role: 'user',
              content: prompt
            }
          ],
          stream: callback ? true : false,
          max_tokens: 8192,
          temperature
        })
      })

      if (callback) {
        if (!response.body) {
          callback('[[END]]')

          return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
          const { value, done } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })

          chunk.split('\n').forEach(line => {
            if (line.startsWith('data: ')) {
              const jsonStr = line.replace('data: ', '').trim()

              if (jsonStr === '[DONE]') return

              try {
                const json = JSON.parse(jsonStr)
                const text = json.choices?.[0]?.delta?.content
                text && callback(text)
              } catch (error) {
                console.error('Error parsing JSON response')
              }
            }
          })
        }

        callback('[[END]]')
      } else {
        const finalResponse = (await response.json() as unknown) as LLMResponse

        return finalResponse
      }
    }

    this.agents = agents
    this.globalContext = 'You are a useful agent that the purpose is to answer questions about a specific topic.'
    + 'For that purpose you have a set of agents that are specialized in different topic in order to help you solve each task: '
    + JSON.stringify(agents.map(agent => ({ name: agent.name, description: agent.description, tools: agent.getTools().map(tl => tl.tag) }))) + '.'
    + 'Each agent has different tools to solve one specific task, you will have to ask the dedicated agent each time what are its tools and how to use them before calling them.'
    + 'To get the agent\'s tools descriptions just send me the following json {"action": "describe","agent": "agent\'name"}.'
    + 'If you want to use a specific tool, send me the following json: {"agent":"agent\'s name","tool":"agent\'s tag","input":"agent\'s input"} and I will do the task for you.'
    + 'Loop through all this until you have the final answer.'
    + 'If you can\'t resolve the task, just send me the following json: {"tool":"none","input":"explication on why you cannot help"}.'
    + 'If you have the final answer, send me the following: {"tool":"finished","input":"the final result"}.'
    + 'Don\'t explain the process of what you are doing, just do it and always exchange json objects with me and always use the language I am using to communicate with you.'
    + optionalPrompt || ''
  }

  private async chain(prompt: string, history: LLMMessage[], logCallback?: (log: string) => void): Promise<string> {
    const answer = await this.questioner(this.globalContext, prompt, history)
    const actualResponse = answer ? removeInfoStrings(answer.choices[0].message.content).trim() : ''
    logCallback && logCallback(actualResponse)

    if (actualResponse.startsWith('{')) {
      const { action, agent, tool, input } = JSON.parse(actualResponse)
      if (action === 'describe') {
        const actualAgent = this.agents.find(agt => agt.name === agent)
        if (actualAgent) {
          return await this.chain(
            JSON.stringify(actualAgent.getTools()),
            [
              ...history,
              { role: LLMMessageRole.USER, content: prompt },
              { role: LLMMessageRole.ASSISTANT, content: actualResponse },
            ],
            logCallback
          )
        } else {
          logCallback && logCallback('No matching agent found for this task')

          return 'No matching agent found for this task'
        }
      } else {
        if (agent) {
          const actualAgent = this.agents.find(agt => agt.name === agent)
          if (actualAgent) {
            const actualTool = actualAgent.getTools().find(tl => tl.tag === tool)
            if (actualTool) {
              const toolResponse = await actualTool.call(input)

              return this.chain(
                toolResponse,
                [
                  ...history,
                  { role: LLMMessageRole.USER, content: prompt },
                  { role: LLMMessageRole.ASSISTANT, content: actualResponse },
                  { role: LLMMessageRole.USER, content: `tool response: ${toolResponse}` }
                ],
                logCallback
              )
            } else {
              logCallback && logCallback('No matching tool found for this task')

              return 'No matching tool found for this task'
            }
          } else {
            logCallback && logCallback('No matching agent found for this task')

            return 'No matching agent found for this task'
          }
        } else {
          return input as string
        }
      }
    }

    return 'Data in wrong format ' + actualResponse
  }

  async executeTask(prompt: string, history?: LLMMessage[], logCallback?: (log: string) => void) {
    return this.chain(
      prompt,
      [
        ...(history || []),
        { role: LLMMessageRole.USER, content: prompt }
      ],
      logCallback
    )
  }

  async askLLM(systemPrompt: string, prompt: string, history?: LLMMessage[], logCallback?: (log: string) => void) {
    return this.questioner(systemPrompt, prompt, history || [], logCallback)
  }
}