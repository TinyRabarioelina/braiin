# 🧠 BRAIIN - Behavioral Reasoning AI for Intelligent Navigation

**BRAIIN** is an AI-powered tool orchestrator that intelligently selects and combines **API calls, database queries, and external tools** to achieve complex tasks.  
Inspired by systems like **J.A.R.V.I.S.**, **BRAIIN** enables **autonomous reasoning** to determine the best execution path for a given request.

## 🚀 Features
- 🏗 **Tool Orchestration** – Dynamically chooses the best tools (APIs, databases, system commands) for a task.
- 🔄 **Multi-Step Reasoning** – Can combine multiple tools to solve complex problems.
- 🧠 **LLM-Powered Decision Making** – Uses **large language models** (LLMs) to analyze and optimize tool usage.
- 🔌 **Flexible & Extendable** – Easily add **custom tools** for specific use cases.
- ⚡ **Real-Time Execution** – Executes tasks efficiently with minimal latency.

## 📦 Installation
```sh
npm install braiin
```

## Example
```typescript
// user.retriever.tool.ts
import { Tool } from 'braiin';

const users = [
  {
    name: 'User 1,
    age: 25,
    email: 'user1@example.com'
  },
  {
    name: 'User 2,
    age: 30,
    email: 'user2@example.com'
  },
  {
    name: 'User 3,
    age: 35,
    email: 'user3@example.com'
  }
]

export const userRetrieverTool: Tool = {
  tag: 'user-retriever',
  description: `Retrieve a user informations from its name`,
  input: 'The user\'s name',
  output: 'A json object containing the user\'s informations if the user was found, an empty string otherwise',
  call: async (topicId?: string) => {
    const user = users.find(user => user.name === topicId)

    return user ? JSON.stringify(user) : ''
  }
}
```

```typescript
// user.birth.tool.ts
import { Tool } from 'braiin';

export const userBirthYearTool: Tool = {
  tag: 'user-birth-year',
  description: `Compute the birth year of a user from its age`,
  input: 'The user\'s age',
  output: 'A number representing the user\'s birth year',
  call: async (age?: string) => {
    const date = new Date()
    const year = date.getFullYear()
    const ageAsNumber = age ? parseInt(age) : year

    return year - ageAsNumber
  }
}
```

```typescript
// index.ts
import { userRetrieverTool } from './user.retriever.tool.ts';
import { userBirthYearTool } from './user.birth.tool.ts';
import { Agent, Orchestrator } from 'braiin';

const agent = new Agent(
  'user-agent',
  'You are a useful assistant that answers questions about users.',
  [
    userRetrieverTool,
    userBirthYearTool
  ]
)

const orchestrator = new Orchestrator(
  [userAgent],
  {
    apiKey: "your api key",
    model: "the LLM model you want to use,
    serverUrl: "https://api.openai.com/v1/chat/completions if you are using ChatGPT, refer to their documentation if you are using another LLM",
    temperature: 0
  }
)

const answer = await orchestrator.executeTask(
  "When was User 1 born?"
)
```