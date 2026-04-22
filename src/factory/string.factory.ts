const stripMarkdownFences = (input: string): string => {
  const match = input.trim().match(/^```(?:[a-zA-Z]+)?\s*\n?([\s\S]*?)\n?```$/)
  return match ? match[1] : input
}

export const extractJson = (input: string): object | null => {
  const cleaned = stripMarkdownFences(input)

  let searchFrom = 0
  while (searchFrom < cleaned.length) {
    const start = cleaned.indexOf('{', searchFrom)
    if (start === -1) return null

    let depth = 0
    let inString = false
    let escape = false

    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i]

      if (escape) {
        escape = false
        continue
      }

      if (inString) {
        if (ch === '\\') escape = true
        else if (ch === '"') inString = false
        continue
      }

      if (ch === '"') {
        inString = true
        continue
      }

      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          try {
            return JSON.parse(cleaned.substring(start, i + 1))
          } catch {
            break
          }
        }
      }
    }

    searchFrom = start + 1
  }

  return null
}
