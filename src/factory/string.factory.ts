export const extractJson = (input: string): object | null => {
  const start = input.indexOf('{')
  if (start === -1) return null

  let depth = 0
  for (let i = start; i < input.length; i++) {
    if (input[i] === '{') depth++
    else if (input[i] === '}') depth--

    if (depth === 0) {
      try {
        return JSON.parse(input.substring(start, i + 1))
      } catch {
        return null
      }
    }
  }

  return null
}