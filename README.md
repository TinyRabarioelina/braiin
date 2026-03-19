# 🧠 BRAIIN - Behavioral Reasoning AI for Intelligent Navigation

**BRAIIN** is an AI-powered tool orchestrator that intelligently selects and combines **API calls, database queries, and external tools** to achieve complex tasks.
Inspired by systems like **J.A.R.V.I.S.**, **BRAIIN** enables **autonomous reasoning** to determine the best execution path for a given request.

## 🚀 Features
- 🏗 **Tool Orchestration** – Dynamically chooses the best tools (APIs, databases, system commands) for a task.
- 🔄 **Multi-Step Reasoning** – Can combine multiple tools to solve complex problems.
- 🧠 **LLM-Powered Decision Making** – Uses **large language models** (LLMs) to analyze and optimize tool usage.
- 🔌 **Flexible & Extendable** – Easily add **custom tools** for specific use cases.
- ⚡ **Real-Time Execution** – Executes tasks efficiently with minimal latency.
- 🧩 **Structured Tool Input** – Tools accept simple strings or structured objects for complex parameters.
- 🔁 **Context Persistence** – Tool results are tracked across tasks to avoid redundant calls.

## 📦 Installation
```sh
npm install braiin openai
```

## Concept
BRAIIN is based on the concept of an Orchestrator and one or multiple Agents that have each one or multiple Tools.

- A **tool** is an object that has a tag, a description, an input and an output fields. Its purpose is to achieve a given specific goal like writing a file. The input can be a simple string description or an array of structured parameters.
- An **agent** is an object that has a name, a description and a list of tools. Each agent is specialised in a specific topic (math, management, handling files, ...) and has a set of tools (write file, read file, ...) that can be used to achieve a specific goal.
- An **orchestrator** is an object that has a set of agents that are each specialised in a specific topic.
The orchestrator is the one that orchestrates the execution of the tools based on the user's request. It is the one that chooses which agent to use and which tool to use, it is capable of combining the tools to achieve the best result.

![concept](https://github.com/TinyRabarioelina/braiin/blob/main/assets/braiin.png)

## Example
```typescript
// user.retriever.tool.ts
import { Tool } from 'braiin'

const users = [
  { name: 'User 1', age: 25, email: 'user1@example.com' },
  { name: 'User 2', age: 30, email: 'user2@example.com' },
  { name: 'User 3', age: 35, email: 'user3@example.com' }
]

export const userRetrieverTool: Tool = {
  tag: 'user-retriever',
  description: 'Retrieve a user informations from its name',
  input: 'The user\'s name',
  output: 'A json object containing the user\'s informations if the user was found, an empty string otherwise',
  call: async (userName) => {
    const user = users.find(u => u.name === userName)
    return user ? JSON.stringify(user) : ''
  }
}
```

```typescript
// user.birth.tool.ts
import { Tool } from 'braiin'

export const userBirthYearTool: Tool = {
  tag: 'user-birth-year',
  description: 'Compute the birth year of a user from its age',
  input: 'The user\'s age',
  output: 'A number representing the user\'s birth year',
  call: async (age) => {
    const year = new Date().getFullYear()
    const ageAsNumber = age ? parseInt(age as string) : year
    return `${year - ageAsNumber}`
  }
}
```

```typescript
// index.ts
import { userRetrieverTool } from './user.retriever.tool'
import { userBirthYearTool } from './user.birth.tool'
import { createAgent, createOrchestrator } from 'braiin'

const userAgent = createAgent(
  'user-agent',
  'You are a useful assistant that answers questions about users.',
  [userRetrieverTool, userBirthYearTool]
)

const orchestrator = createOrchestrator(
  [userAgent],
  {
    apiKey: 'your api key',
    model: 'gpt-4o',
    serverUrl: 'https://api.openai.com/v1',
    temperature: 0
  }
)

const result = await orchestrator.executeTask(
  'When was User 1 born?'
)

console.log(result.answer) // User 1 was born in 2001
console.log(result.status) // 'success'
console.log(result.toolTraces) // [{ tool: 'user-retriever', input: 'User 1', result: '...' }, ...]
```

## Context Persistence

Tool results are tracked as `toolTraces` and can be passed between calls to avoid redundant tool executions:

```typescript
const first = await orchestrator.executeTask('Tell me about User 1\'s wife')
// toolTraces now contains the data fetched about User 1 and his wife

const second = await orchestrator.executeTask(
  'Has User 1 been married before?',
  [],
  first.toolTraces
)
// The orchestrator already knows User 1's info from the previous traces
```

## Structured Tool Input

Tools can define structured parameters instead of a simple string description:

```typescript
import { Tool } from 'braiin'

const writeFileTool: Tool = {
  tag: 'write-file',
  description: 'Write content to a file',
  input: [
    { name: 'path', description: 'The file path', required: true },
    { name: 'content', description: 'The file content', required: true }
  ],
  output: 'Confirmation that the file was written',
  call: async (input) => {
    const { path, content } = input as Record<string, string>
    // write file logic here
    return `File written to ${path}`
  }
}
```

## Configuration

| Option | Default | Description |
| --- | --- | --- |
| `apiKey` | *required* | Your LLM API key |
| `model` | `'gpt-4o'` | The model to use |
| `serverUrl` | `'https://api.openai.com/v1'` | Base URL for any OpenAI-compatible API |
| `temperature` | `0` | LLM temperature |
| `maxSteps` | `50` | Maximum chain iterations (prevents infinite loops) |
| `stepsInterval` | `undefined` | Delay in ms between chain steps (rate limiting) |
| `optionalPrompt` | `undefined` | Additional instructions appended to the system prompt |
