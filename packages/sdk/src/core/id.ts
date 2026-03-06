let counter = 0

export function generateId(prefix = 'n'): string {
  return `${prefix}${counter++}`
}

export function resetIds(): void {
  counter = 0
}
