export function isTelegramChatAllowed(chatId: number, allowedChatIds: readonly number[]): boolean {
  return allowedChatIds.includes(chatId)
}
