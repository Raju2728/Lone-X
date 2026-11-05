export const defaultModel = 'qwen2.5:0.5b'

export const chatModels = [
  { key: defaultModel, name: 'Qwen2.5 0.5B', tag: 'Local', detail: 'Everyday chat · English & Thanglish' },
  { key: 'qwen2.5-coder:0.5b', name: 'Qwen2.5 Coder 0.5B', tag: 'Local', detail: 'Coding questions · English & Thanglish' },
  { key: 'gemma3:1b', name: 'Gemma 3 1B', tag: 'Local', detail: 'General-purpose chat · English & Thanglish' },
  { key: 'qwen3:4b-instruct', name: 'Qwen3 4B Instruct', tag: 'Agent', detail: 'English & Thanglish · tools · about 2.5 GB · Apache 2.0' }
]

export type ModelInventoryItem = { name: string; size: number | null }
export type ModelProgress = { model: string; status: string; percent: number | null }
