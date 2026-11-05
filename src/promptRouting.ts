import language from '../desktop/language.json'

export function isDesktopFileRequest(text: string) {
  if (!/\bdesktop(?:la|le|il|ula|ku|kku)?\b/i.test(text) || !(/\b(?:file|folder|directory|document)\b/i.test(text) || /\b[^\s\\/:"<>|?*]+\.(?:txt|md|json|[cm]?[jt]sx?|py|html?|css|csv|ya?ml|log|xml)\b/i.test(text))) return false
  const english = /^(?:please\s+)?(?:create|make|write|edit|read|delete|remove)\b/i.test(text)
  const thanglish = /\bdesktop[\s-]*(?:la|le|il|ula|ku|kku)\b/i.test(text) && new RegExp(language.desktopActionPattern, 'i').test(text)
  return english || thanglish
}
