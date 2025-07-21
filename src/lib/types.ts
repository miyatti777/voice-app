// ドラマスタジオ用型定義
export type DramaStep = 'select' | 'character' | 'user' | 'result'
export type Speaker = 'character' | 'user'

export interface ScriptLine {
  speaker: Speaker
  text?: string
  prompt?: string
}

export interface Character {
  name: string
  voice: {
    pitch: number
    rate: number
  }
}

export interface DramaScenario {
  id: string
  title: string
  description: string
  character: Character
  lines: ScriptLine[]
}

export interface UserRecording {
  blob: Blob
  url: string
  lineIndex: number
}

export interface CharacterAudio {
  url: string
  lineIndex: number
  isGenerated: boolean
} 