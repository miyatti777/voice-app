import { DramaScenario } from '@/lib/types'

export const DRAMA_SCENARIOS: DramaScenario[] = [
  {
    id: 'date',
    title: 'カフェデートシナリオ',
    description: '優しい恋人との甘いひととき',
    character: {
      name: '優しい恋人',
      voice: { pitch: 2.0, rate: 0.9 }
    },
    lines: [
      {
        speaker: 'character',
        text: 'やっと二人きりになれたね。今日は君と過ごせて本当に嬉しいよ。'
      },
      {
        speaker: 'user',
        prompt: '彼/彼女への返事を録音してください（例：私も嬉しいです）'
      },
      {
        speaker: 'character',
        text: 'そんな風に言ってくれると照れちゃうな。君といると時間を忘れてしまう。'
      },
      {
        speaker: 'user',
        prompt: '最後の返事を録音してください（例：ずっと一緒にいよう）'
      },
      {
        speaker: 'character',
        text: 'また今度、二人でこんな時間を過ごそうね。君がいてくれて本当に幸せだよ。'
      }
    ]
  },
  {
    id: 'comfort',
    title: 'お疲れ様シナリオ',
    description: '優しい先輩からの励まし',
    character: {
      name: '優しい先輩',
      voice: { pitch: 0.0, rate: 0.8 }
    },
    lines: [
      {
        speaker: 'character',
        text: 'お疲れさま。今日も一日頑張ったね。疲れた顔してるけど大丈夫？'
      },
      {
        speaker: 'user',
        prompt: '今日の気持ちを録音してください（例：今日はちょっと大変でした）'
      },
      {
        speaker: 'character',
        text: 'そうか、それは大変だったね。でも君ならきっと乗り越えられるよ。'
      },
      {
        speaker: 'user',
        prompt: '感謝の気持ちを録音してください（例：ありがとうございます）'
      },
      {
        speaker: 'character',
        text: 'いつでも頼ってくれていいからね。君の笑顔が一番大切だから。'
      }
    ]
  },
  {
    id: 'cheer',
    title: '応援シナリオ',
    description: '元気な後輩からの励まし',
    character: {
      name: '元気な後輩',
      voice: { pitch: 6.0, rate: 1.1 }
    },
    lines: [
      {
        speaker: 'character',
        text: '先輩！明日の発表、緊張してるって聞きました！大丈夫ですか？'
      },
      {
        speaker: 'user',
        prompt: '不安な気持ちを録音してください（例：ちょっと緊張してます）'
      },
      {
        speaker: 'character',
        text: 'でも先輩なら絶対大丈夫です！今まで見てきた先輩の頑張り、すごいと思ってます！'
      },
      {
        speaker: 'user',
        prompt: '決意を録音してください（例：頑張ってみます）'
      },
      {
        speaker: 'character',
        text: 'その意気です！私も応援してるので、先輩らしく頑張ってくださいね！'
      }
    ]
  }
]

// シナリオを取得するヘルパー関数
export const getScenarioById = (id: string): DramaScenario | undefined => {
  return DRAMA_SCENARIOS.find(scenario => scenario.id === id)
}

// ランダムなシナリオを取得
export const getRandomScenario = (): DramaScenario => {
  const randomIndex = Math.floor(Math.random() * DRAMA_SCENARIOS.length)
  return DRAMA_SCENARIOS[randomIndex]
} 