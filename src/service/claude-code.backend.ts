import { spawn } from 'node:child_process'
import { LLMMessageRole, LLMResponse } from "../model/llm"
import { LLMService } from "./llm.service"

export interface ClaudeCodeConfig {
  kind: 'claude-code'
  sessionId: string
  cliPath?: string
  timeoutMs?: number
  signal?: AbortSignal
}

const STREAM_END_MARKER = '[[END]]'
const DEFAULT_CLI_PATH = 'claude'
const MODEL_TAG = 'claude-code'

interface ClaudeCliJsonOutput {
  type?: string
  subtype?: string
  is_error?: boolean
  result?: string
  session_id?: string
  stop_reason?: string
}

export const buildClaudeCodeArgs = (
  config: ClaudeCodeConfig,
  systemPrompt: string,
  prompt: string
): string[] => [
  '-p',
  '--session-id', config.sessionId,
  '--system-prompt', systemPrompt,
  '--tools', '',
  '--output-format', 'json',
  prompt
]

const errorResponse = (message: string, type: string): LLMResponse => ({
  id: '',
  object: '',
  created: 0,
  model: MODEL_TAG,
  choices: [],
  error: { message, type, param: '', code: '' }
})

export const parseClaudeCodeJsonOutput = (stdout: string): LLMResponse => {
  const trimmed = stdout.trim()
  if (!trimmed) {
    return errorResponse('Claude CLI returned empty output', 'cli_error')
  }

  let parsed: ClaudeCliJsonOutput
  try {
    parsed = JSON.parse(trimmed)
  } catch (e) {
    return errorResponse(
      `Failed to parse claude CLI output: ${(e as Error).message}`,
      'parse_error'
    )
  }

  if (parsed.is_error) {
    return errorResponse(parsed.result ?? 'Claude CLI returned an error', 'cli_error')
  }

  return {
    id: parsed.session_id ?? '',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: MODEL_TAG,
    choices: [{
      index: 0,
      message: {
        role: LLMMessageRole.ASSISTANT,
        content: parsed.result ?? ''
      },
      finish_reason: parsed.stop_reason ?? 'stop'
    }]
  }
}

const buildRequestSignal = (config: ClaudeCodeConfig): AbortSignal | undefined => {
  const signals: AbortSignal[] = []
  if (config.signal) signals.push(config.signal)
  if (config.timeoutMs !== undefined) signals.push(AbortSignal.timeout(config.timeoutMs))

  if (signals.length === 0) return undefined
  if (signals.length === 1) return signals[0]
  return AbortSignal.any(signals)
}

const runClaudeCli = (
  cliPath: string,
  args: string[],
  signal?: AbortSignal
): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
  return new Promise((resolve, reject) => {
    const child = spawn(cliPath, args, { signal })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    child.on('error', reject)
    child.on('close', code => resolve({ stdout, stderr, exitCode: code ?? -1 }))
  })
}

export const createClaudeCodeBackend = (config: ClaudeCodeConfig): LLMService => {
  const cliPath = config.cliPath ?? DEFAULT_CLI_PATH

  return {
    ask: async (systemPrompt, prompt, _history, callback?) => {
      const args = buildClaudeCodeArgs(config, systemPrompt, prompt)
      const signal = buildRequestSignal(config)

      try {
        const { stdout, stderr, exitCode } = await runClaudeCli(cliPath, args, signal)

        if (exitCode !== 0) {
          const reason = stderr.trim() || `exit code ${exitCode}`
          return errorResponse(`claude CLI failed: ${reason}`, 'cli_error')
        }

        const response = parseClaudeCodeJsonOutput(stdout)

        if (callback) {
          const content = response.choices[0]?.message.content
          if (content) callback(content)
          callback(STREAM_END_MARKER)
        }

        return response
      } catch (error) {
        if (error instanceof Error) {
          if (error.name === 'AbortError' || error.name === 'TimeoutError') {
            return errorResponse(`Request aborted: ${error.message}`, 'timeout_error')
          }
          return errorResponse(error.message, 'cli_error')
        }
        return errorResponse('Unknown error', 'cli_error')
      }
    }
  }
}
