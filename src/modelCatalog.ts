export const defaultModel = 'qwen2.5:0.5b'

export const chatModels = [
  { key: defaultModel, name: 'Qwen2.5 0.5B', tag: 'Local', detail: 'Default model for everyday chat' },
  { key: 'qwen2.5-coder:0.5b', name: 'Qwen2.5 Coder 0.5B', tag: 'Local', detail: 'Small model for coding questions' },
  { key: 'gemma3:1b', name: 'Gemma 3 1B', tag: 'Local', detail: 'General-purpose model with a larger download' }
]

export type ModelInventoryItem = { name: string; size: number | null }
export type ModelProgress = { model: string; status: string; percent: number | null }
