export const freeze = (time: number) => new Promise<void>((resolve) => {
  setTimeout(() => resolve(), time)
})