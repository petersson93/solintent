import { atom } from 'jotai'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  blocks?: any[]
  ts: number
}

export const messagesAtom = atom<ChatMessage[]>([])
export const inputAtom = atom('')
export const isParsingAtom = atom(false)
