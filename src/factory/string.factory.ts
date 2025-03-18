export const removeInfoStrings = (input: string) => {
  return input.replaceAll(/```[a-zA-Z0-9_-]*/g, '```\n').replaceAll('```', '')
}