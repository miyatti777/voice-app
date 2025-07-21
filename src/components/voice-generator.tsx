"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Mic, Play, Sparkles, Heart, Users, Coffee, RefreshCw, ChevronRight, ArrowLeft } from "lucide-react"
import { DRAMA_SCENARIOS, getScenarioById } from '@/data/scenarios'
import type { DramaStep, DramaScenario, CharacterAudio } from '@/lib/types'

// PCM→WAV変換関数
function convertPCMToWAV(base64Data: string, sampleRate = 24000): string {
  try {
    console.log('PCM→WAV変換開始', { sampleRate, dataLength: base64Data.length });
    
    // Base64をバイナリデータに変換
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // WAVヘッダーを作成
    const numChannels = 1; // モノラル
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    
    // RIFFヘッダー
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + bytes.length, true); // ファイルサイズ - 8
    view.setUint32(8, 0x57415645, false); // "WAVE"
    
    // fmtチャンク
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true); // fmtチャンクのサイズ
    view.setUint16(20, 1, true); // PCMフォーマット
    view.setUint16(22, numChannels, true); // チャンネル数
    view.setUint32(24, sampleRate, true); // サンプルレート
    view.setUint32(28, byteRate, true); // バイトレート
    view.setUint16(32, blockAlign, true); // ブロックアライン
    view.setUint16(34, bitsPerSample, true); // ビット数
    
    // dataチャンク
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, bytes.length, true); // データサイズ
    
    // WAVファイルの結合
    const wavData = new Uint8Array(44 + bytes.length);
    wavData.set(new Uint8Array(header), 0);
    wavData.set(bytes, 44);
    
    // Base64エンコード
    let wavBase64 = '';
    const chunkSize = 8192;
    for (let i = 0; i < wavData.length; i += chunkSize) {
      const chunk = wavData.slice(i, i + chunkSize);
      wavBase64 += String.fromCharCode.apply(null, Array.from(chunk));
    }
    
    const finalBase64 = btoa(wavBase64);
    const wavUrl = `data:audio/wav;base64,${finalBase64}`;
    
    console.log('PCM→WAV変換完了', { 
      originalSize: bytes.length, 
      wavSize: wavData.length,
      finalUrlLength: wavUrl.length 
    });
    
    return wavUrl;
    
  } catch (error) {
    console.error('PCM→WAV変換エラー:', error);
    throw new Error(`音声変換に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// 🎯 Phase 4: SimpleRecorder クラス
class SimpleRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private stream: MediaStream | null = null

  async requestMicPermission(): Promise<boolean> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 44100,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      })
      return true
    } catch (error) {
      console.error('マイクアクセス許可エラー:', error)
      return false
    }
  }

  async startRecording(): Promise<void> {
    if (!this.stream) {
      throw new Error('マイクアクセスが許可されていません')
    }

    this.chunks = []
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: 'audio/webm; codecs=opus'
    })
    
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data)
      }
    }
    
    this.mediaRecorder.start(100) // 100ms間隔でデータを収集
  }

  async stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('録音が開始されていません'))
        return
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'audio/webm' })
        resolve(blob)
      }

      this.mediaRecorder.onerror = (error) => {
        reject(error)
      }

      this.mediaRecorder.stop()
    })
  }

  cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }
    this.mediaRecorder = null
    this.chunks = []
  }

  get isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording'
  }
}

// 🎯 Phase 4: ユーザー音声データ型
interface UserAudio {
  url: string
  lineIndex: number
  blob: Blob
  duration?: number
}

export default function VoiceGenerator() {
  // 🎯 Phase 3: 拡張された状態管理
  const [currentStep, setCurrentStep] = useState<DramaStep>('select')
  const [selectedScenario, setSelectedScenario] = useState<DramaScenario | null>(null)
  const [currentLineIndex, setCurrentLineIndex] = useState(0)
  
  // 音声データ管理（Phase 3新規）
  const [characterAudios, setCharacterAudios] = useState<CharacterAudio[]>([])
  
  // 🎯 Phase 4: ユーザー録音関連状態
  const [userAudios, setUserAudios] = useState<UserAudio[]>([])
  const [isRecording, setIsRecording] = useState(false)
  const [micPermission, setMicPermission] = useState<'pending' | 'granted' | 'denied'>('pending')
  const recorderRef = useRef<SimpleRecorder | null>(null)
  
  // 進行状況管理（Phase 3新規）
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false)
  
  // 既存の状態
  const audioRefOriginal = useRef<HTMLAudioElement | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 🎯 Phase 3: 進行状況計算（Phase 4 + 5対応修正）
  const getTotalSteps = () => {
    if (!selectedScenario) return 0
    // 全ステップ数を返す（キャラクター + ユーザー）
    return selectedScenario.lines.length
  }
  
  const getCompletionPercentage = () => {
    const total = getTotalSteps()
    if (total === 0) return 0
    return Math.round((completedSteps.size / total) * 100)
  }
  
  const getCurrentCharacterLine = () => {
    if (!selectedScenario) return null
    return selectedScenario.lines[currentLineIndex]
  }
  
  const isCurrentStepCompleted = () => {
    return completedSteps.has(currentLineIndex)
  }

  // 🎯 Phase 3: 音声データ管理関数
  const addCharacterAudio = (url: string, lineIndex: number) => {
    const newAudio: CharacterAudio = {
      url,
      lineIndex,
      isGenerated: true
    }
    setCharacterAudios(prev => {
      const filtered = prev.filter(audio => audio.lineIndex !== lineIndex)
      return [...filtered, newAudio]
    })
    setCompletedSteps(prev => new Set([...prev, lineIndex]))
  }
  
  const getCharacterAudio = (lineIndex: number): CharacterAudio | null => {
    return characterAudios.find(audio => audio.lineIndex === lineIndex) || null
  }

  // 🎯 Phase 4: 録音機能管理関数
  const initializeRecorder = async () => {
    if (!recorderRef.current) {
      recorderRef.current = new SimpleRecorder()
    }
    
    try {
      const hasPermission = await recorderRef.current.requestMicPermission()
      setMicPermission(hasPermission ? 'granted' : 'denied')
      return hasPermission
    } catch (error) {
      console.error('マイク初期化エラー:', error)
      setMicPermission('denied')
      setError('マイクへのアクセスが許可されませんでした')
      return false
    }
  }

  const startRecording = async () => {
    if (!recorderRef.current) {
      await initializeRecorder()
    }

    if (micPermission !== 'granted') {
      const hasPermission = await initializeRecorder()
      if (!hasPermission) return
    }

    try {
      await recorderRef.current!.startRecording()
      setIsRecording(true)
      setError(null)
      console.log('録音開始')
    } catch (error) {
      console.error('録音開始エラー:', error)
      setError('録音の開始に失敗しました')
    }
  }

  const stopRecording = async () => {
    if (!recorderRef.current || !isRecording) return

    try {
      const audioBlob = await recorderRef.current.stopRecording()
      setIsRecording(false)
      
      // Blob URLを作成
      const audioUrl = URL.createObjectURL(audioBlob)
      
      // ユーザー音声データとして保存
      const userAudio: UserAudio = {
        url: audioUrl,
        lineIndex: currentLineIndex,
        blob: audioBlob
      }
      
      setUserAudios(prev => {
        const filtered = prev.filter(audio => audio.lineIndex !== currentLineIndex)
        return [...filtered, userAudio]
      })
      
      setCompletedSteps(prev => new Set([...prev, currentLineIndex]))
      
      console.log('録音完了:', audioUrl)
    } catch (error) {
      console.error('録音停止エラー:', error)
      setError('録音の保存に失敗しました')
      setIsRecording(false)
    }
  }

  const getUserAudio = (lineIndex: number): UserAudio | null => {
    return userAudios.find(audio => audio.lineIndex === lineIndex) || null
  }

  const playUserAudio = async (lineIndex: number) => {
    const userAudio = getUserAudio(lineIndex)
    if (!userAudio) return

    try {
      const audioElement = new Audio(userAudio.url)
      audioRefOriginal.current = audioElement
      
      audioElement.addEventListener('error', (e) => {
        console.error('ユーザー音声再生エラー:', e)
        setError('録音した音声の再生でエラーが発生しました')
      })
      
      await audioElement.play()
      console.log('ユーザー音声再生開始:', lineIndex)
    } catch (error) {
      console.error('ユーザー音声再生失敗:', error)
      setError('録音した音声の再生に失敗しました')
    }
  }

  // 🎯 Phase 5: 連続再生機能
  const [isPlayingDrama, setIsPlayingDrama] = useState(false)

  const playDramaSequentially = async () => {
    if (!selectedScenario || isPlayingDrama) return
    
    setIsPlayingDrama(true)
    setError(null)
    
    try {
      // シナリオの順序に従って音声を順次再生
      for (let i = 0; i < selectedScenario.lines.length; i++) {
        const line = selectedScenario.lines[i]
        
        if (line.speaker === 'character') {
          // キャラクター音声を再生
          const characterAudio = getCharacterAudio(i)
          if (characterAudio) {
            console.log(`ドラマ再生: ステップ${i + 1} - キャラクター音声`)
            await playAudioSequentially(characterAudio.url)
          } else {
            console.log(`ドラマ再生: ステップ${i + 1} - キャラクター音声が見つかりません`)
          }
        } else if (line.speaker === 'user') {
          // ユーザー音声を再生
          const userAudio = getUserAudio(i)
          if (userAudio) {
            console.log(`ドラマ再生: ステップ${i + 1} - ユーザー音声`)
            await playAudioSequentially(userAudio.url)
          } else {
            console.log(`ドラマ再生: ステップ${i + 1} - ユーザー音声が見つかりません（スキップ）`)
            // ユーザー音声がない場合は1秒の無音を挿入
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        }
        
        // 音声間に0.5秒の間隔を空ける
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      
      console.log('ドラマ再生完了！')
    } catch (error) {
      console.error('ドラマ連続再生エラー:', error)
      setError('ドラマの連続再生でエラーが発生しました')
    } finally {
      setIsPlayingDrama(false)
    }
  }

  const playAudioSequentially = (audioUrl: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const audioElement = new Audio(audioUrl)
      audioRefOriginal.current = audioElement
      
      audioElement.addEventListener('ended', () => {
        console.log('音声再生完了')
        resolve()
      })
      
      audioElement.addEventListener('error', (e) => {
        console.error('音声再生エラー:', e)
        reject(new Error('音声再生に失敗しました'))
      })
      
      audioElement.play().catch(reject)
    })
  }

  const stopDramaPlayback = () => {
    if (audioRefOriginal.current) {
      audioRefOriginal.current.pause()
      audioRefOriginal.current.currentTime = 0
    }
    setIsPlayingDrama(false)
  }

  // 🎯 Phase 3: 拡張されたシナリオ選択
  const handleScenarioSelect = (scenarioId: string) => {
    const scenario = getScenarioById(scenarioId)
    if (scenario) {
      setSelectedScenario(scenario)
      setCurrentStep('character')
      setCurrentLineIndex(0)
      // リセット（Phase 3新規）
      setCharacterAudios([])
      setCompletedSteps(new Set())
    }
  }

  // 🎯 Phase 3: 拡張された次ステップ処理
  const handleNextStep = () => {
    if (!selectedScenario) return
    
    const nextIndex = currentLineIndex + 1
    if (nextIndex < selectedScenario.lines.length) {
      setCurrentLineIndex(nextIndex)
      
      // 次の話者に応じて画面遷移
      if (selectedScenario.lines[nextIndex].speaker === 'user') {
        setCurrentStep('user')
      } else if (selectedScenario.lines[nextIndex].speaker === 'character') {
        setCurrentStep('character')
      }
    } else {
      // 全て完了、result画面へ
      setCurrentStep('result')
    }
  }
  
  // 🎯 Phase 3: 戻る機能
  const handlePreviousStep = () => {
    if (currentLineIndex > 0) {
      setCurrentLineIndex(currentLineIndex - 1)
      setCurrentStep('character')
    } else {
      setCurrentStep('select')
    }
  }

  // 🎯 Phase 3: 拡張された音声生成
  const generateAudio = async () => {
    const currentLine = getCurrentCharacterLine()
    if (!currentLine || !currentLine.text || !selectedScenario) return

    // 既存音声チェック
    const existingAudio = getCharacterAudio(currentLineIndex)
    if (existingAudio) {
      // 既存音声を再生
      const audioElement = new Audio(existingAudio.url)
      audioRefOriginal.current = audioElement
      
      audioElement.addEventListener('ended', () => {
        console.log('音声再生完了');
      });
      
      audioElement.addEventListener('error', (e) => {
        console.error('音声再生エラー:', e);
        setError('音声の再生でエラーが発生しました');
      });
      
      try {
        await audioElement.play()
        console.log('既存音声再生開始');
      } catch (error) {
        console.error('音声再生失敗:', error);
        setError('音声の再生に失敗しました');
      }
      return
    }

    setIsGeneratingAudio(true)
    setError(null)
    
    try {
      console.log('音声生成開始:', currentLine.text);
      
      const response = await fetch('/api/generate-speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: currentLine.text.trim() }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.details || `API request failed: ${response.status}`)
      }

      // APIレスポンスのJSONを取得（音声データも含む）
      const data = await response.json()
      console.log('API レスポンス構造:', data);
      
      // 音声データを抽出
      if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
        const audioPart = data.candidates[0].content.parts.find((part: { inlineData?: { mimeType?: string; data?: string } }) => 
          part.inlineData && part.inlineData.mimeType?.includes('audio')
        );
        
        if (audioPart && audioPart.inlineData && audioPart.inlineData.data) {
          console.log('音声データ検出:', {
            mimeType: audioPart.inlineData.mimeType,
            dataLength: audioPart.inlineData.data.length
          });
          
          // PCM → WAV変換
          const wavUrl = convertPCMToWAV(audioPart.inlineData.data);
          
          // Phase 3: 音声データ管理に追加
          addCharacterAudio(wavUrl, currentLineIndex)
          
          // 🎯 音声要素を作成して再生
          const audioElement = new Audio(wavUrl);
          audioRefOriginal.current = audioElement;
          
          audioElement.addEventListener('ended', () => {
            console.log('新規音声再生完了');
          });
          
          audioElement.addEventListener('loadeddata', () => {
            console.log('音声データ読み込み完了');
          });
          
          audioElement.addEventListener('error', (e) => {
            console.error('音声再生エラー:', e);
            setError('音声の再生準備でエラーが発生しました');
          });
          
          // 音声を再生
          try {
            await audioElement.play()
            console.log('新規音声生成・再生完了');
          } catch (playError) {
            console.error('音声再生失敗:', playError);
            setError('音声の再生に失敗しました');
          }
          
        } else {
          throw new Error('APIレスポンスに音声データが含まれていません');
        }
      } else {
        throw new Error('APIレスポンスの形式が不正です');
      }
      
    } catch (err) {
      console.error('Error generating speech:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setIsGeneratingAudio(false)
    }
  }

  // 🎯 Phase 3: リセット機能拡張 + Phase 4: 録音機能対応 + Phase 5: 連続再生対応
  const handleReset = () => {
    setCurrentStep('select')
    setSelectedScenario(null)
    setCurrentLineIndex(0)
    setCharacterAudios([])
    setCompletedSteps(new Set())
    
    // 🎯 Phase 4: 録音機能のリセット
    setUserAudios([])
    setIsRecording(false)
    setMicPermission('pending')
    
    // 🎯 Phase 5: 連続再生のリセット
    setIsPlayingDrama(false)
    
    // 録音リソースのクリーンアップ
    if (recorderRef.current) {
      recorderRef.current.cleanup()
      recorderRef.current = null
    }
    
    // 音声再生の停止
    if (audioRefOriginal.current) {
      audioRefOriginal.current.pause()
      audioRefOriginal.current.currentTime = 0
    }
    
    // ユーザー音声のBlobURLをクリーンアップ
    userAudios.forEach(audio => {
      URL.revokeObjectURL(audio.url)
    })
  }

  // 古いhandleGenerate関数はgenerateAudio関数に統合されました（Phase 3）

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-100 via-purple-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* ヘッダー */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center">
              <Heart className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              推し活ドラマスタジオ
            </h1>
          </div>
          <p className="text-gray-600">推しと一緒にドラマを作って、特別な時間を過ごそう！</p>
        </div>

        {/* 🎯 Phase 3: プログレスバー */}
        {selectedScenario && currentStep !== 'select' && (
          <Card className="border-0 shadow-lg bg-white/70 backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">進行状況</span>
                  <span className="text-sm text-purple-600 font-bold">{getCompletionPercentage()}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-gradient-to-r from-pink-500 to-purple-500 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${getCompletionPercentage()}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>『{selectedScenario.title}』</span>
                  <span>{completedSteps.size} / {getTotalSteps()} 完了</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 画面分岐 */}
        {currentStep === 'select' && (
          <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-xl text-gray-800 flex items-center justify-center gap-2">
                <Coffee className="w-5 h-5 text-pink-500" />
                シナリオを選択してください
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                {DRAMA_SCENARIOS.map((scenario) => (
                  <Card 
                    key={scenario.id}
                    className="cursor-pointer hover:bg-pink-50 border-2 border-transparent hover:border-pink-300 transition-all"
                    onClick={() => handleScenarioSelect(scenario.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center">
                          {scenario.id === 'cafe-date' && <Coffee className="w-5 h-5 text-white" />}
                          {scenario.id === 'comfort' && <Heart className="w-5 h-5 text-white" />}
                          {scenario.id === 'cheering' && <Sparkles className="w-5 h-5 text-white" />}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-purple-800">{scenario.title}</h3>
                          <p className="text-sm text-gray-600 mt-1">{scenario.description}</p>
                          <p className="text-xs text-purple-600 mt-2">
                            キャラクター: {scenario.character.name}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 'character' && selectedScenario && (
          <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
            <CardHeader className="text-center pb-4">
              <div className="flex items-center justify-between">
                <Button
                  onClick={handlePreviousStep}
                  variant="ghost"
                  size="icon"
                  className="text-gray-500 hover:text-pink-600"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <CardTitle className="text-xl text-gray-800 flex items-center gap-2">
                  <Users className="w-5 h-5 text-pink-500" />
                  {selectedScenario.character.name}
                </CardTitle>
                <div className="w-10" /> {/* スペーサー */}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center mx-auto">
                  <Heart className="w-8 h-8 text-white" />
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <p className="text-lg text-gray-800 leading-relaxed">
                    {selectedScenario.lines[currentLineIndex].text}
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                  <span>ステップ {currentLineIndex + 1} / {selectedScenario.lines.length}</span>
                  {isCurrentStepCompleted() && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                      ✓ 完了済み
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex gap-4">
                <Button
                  onClick={generateAudio}
                  disabled={isGeneratingAudio}
                  className="flex-1 h-12 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white font-medium rounded-xl"
                >
                  {isGeneratingAudio ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      音声生成中...
                    </>
                  ) : isCurrentStepCompleted() ? (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      再生する
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      キャラクターの声を聞く
                    </>
                  )}
                </Button>
                
                <Button
                  onClick={handleNextStep}
                  variant="outline"
                  className="h-12 px-6 border-pink-300 text-pink-600 hover:bg-pink-50"
                >
                  次へ <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 'user' && selectedScenario && (
          <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
            <CardHeader className="text-center pb-4">
              <div className="flex items-center justify-between">
                <Button
                  onClick={handlePreviousStep}
                  variant="ghost"
                  size="icon"
                  className="text-gray-500 hover:text-pink-600"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <CardTitle className="text-xl text-gray-800 flex items-center gap-2">
                  <Mic className="w-5 h-5 text-pink-500" />
                  あなたのターン
                </CardTitle>
                <div className="w-10" /> {/* スペーサー */}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center space-y-4">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${
                  isRecording 
                    ? 'bg-gradient-to-r from-red-500 to-pink-500 animate-pulse' 
                    : 'bg-gradient-to-r from-rose-500 to-pink-500'
                }`}>
                  <Mic className="w-8 h-8 text-white" />
                </div>
                <div className="bg-rose-50 p-4 rounded-lg">
                  <p className="text-lg text-gray-800 leading-relaxed">
                    {selectedScenario.lines[currentLineIndex].prompt}
                  </p>
                </div>
                
                {/* 🎯 Phase 4: マイク許可状態表示 */}
                {micPermission === 'denied' && (
                  <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                    <p className="text-red-600 text-sm">
                      マイクアクセスが拒否されています。ブラウザの設定を確認してください。
                    </p>
                  </div>
                )}
                
                {/* 🎯 Phase 4: 録音状態表示 */}
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                  <span>ステップ {currentLineIndex + 1} / {selectedScenario.lines.length}</span>
                  {isRecording && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs animate-pulse">
                      🔴 録音中...
                    </span>
                  )}
                  {getUserAudio(currentLineIndex) && !isRecording && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                      ✓ 録音済み
                    </span>
                  )}
                </div>
              </div>
              
              {/* 🎯 Phase 4: 録音済み音声の再生エリア */}
              {getUserAudio(currentLineIndex) && !isRecording && (
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                          <Play className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-sm text-green-700 font-medium">録音済み音声</span>
                      </div>
                      <Button
                        onClick={() => playUserAudio(currentLineIndex)}
                        size="sm"
                        variant="outline"
                        className="border-green-300 text-green-600 hover:bg-green-50"
                      >
                        <Play className="w-3 h-3 mr-1" />
                        聞く
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              <div className="flex gap-4">
                {/* 🎯 Phase 4: 録音ボタンの実装 */}
                <Button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={micPermission === 'denied'}
                  className={`flex-1 h-12 font-medium rounded-xl ${
                    isRecording 
                      ? 'bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600' 
                      : getUserAudio(currentLineIndex)
                        ? 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600'
                        : 'bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600'
                  } text-white disabled:opacity-50`}
                >
                  {isRecording ? (
                    <>
                      <div className="w-4 h-4 mr-2 bg-white rounded-sm animate-pulse" />
                      録音停止
                    </>
                  ) : getUserAudio(currentLineIndex) ? (
                    <>
                      <Mic className="w-4 h-4 mr-2" />
                      再録音する
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4 mr-2" />
                      {micPermission === 'pending' ? 'マイクを許可して録音' : '録音開始'}
                    </>
                  )}
                </Button>
                
                <Button
                  onClick={handleNextStep}
                  variant="outline"
                  className="h-12 px-6 border-pink-300 text-pink-600 hover:bg-pink-50"
                >
                  次へ <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 'result' && selectedScenario && (
          <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-xl text-gray-800 flex items-center justify-center gap-2">
                <Sparkles className="w-5 h-5 text-pink-500" />
                ドラマ完成！
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center mx-auto">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <p className="text-lg text-gray-800">
                  『{selectedScenario.title}』完成おめでとう！
                </p>
                <p className="text-sm text-gray-600">
                  推しとの素敵なドラマができました ✨
                </p>
                <div className="bg-gradient-to-r from-pink-50 to-purple-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-700">
                    <div className="flex justify-between">
                      <span>作成済み音声:</span>
                      <span className="font-bold text-purple-600">{characterAudios.length} / {getTotalSteps()}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* 🎯 Phase 3 + Phase 4 + Phase 5: 全音声一覧表示 */}
              {(characterAudios.length > 0 || userAudios.length > 0) && (
                <Card className="bg-purple-50 border-purple-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg text-purple-800 flex items-center gap-2">
                      <Play className="w-4 h-4" />
                      作成済み音声
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {selectedScenario.lines.map((line, index) => {
                      if (line.speaker === 'character') {
                        const audio = getCharacterAudio(index)
                        if (!audio) return null
                        
                        return (
                          <div key={`character-${index}`} className="flex items-center justify-between p-2 bg-white rounded-lg border-l-4 border-purple-400">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center">
                                  <Heart className="w-2 h-2 text-white" />
                                </div>
                                <span className="text-xs text-purple-600 font-medium">{selectedScenario.character.name}</span>
                              </div>
                              <p className="text-sm font-medium text-gray-800">
                                ステップ {index + 1}: {line.text?.substring(0, 30)}...
                              </p>
                            </div>
                            <Button
                              onClick={async () => {
                                try {
                                  const audioElement = new Audio(audio.url)
                                  audioRefOriginal.current = audioElement
                                  
                                  audioElement.addEventListener('error', (e) => {
                                    console.error('音声再生エラー:', e);
                                    setError('音声の再生でエラーが発生しました');
                                  });
                                  
                                  await audioElement.play();
                                  console.log('キャラクター音声再生開始:', index);
                                } catch (error) {
                                  console.error('音声再生エラー:', error);
                                  setError('音声の再生でエラーが発生しました');
                                }
                              }}
                              size="sm"
                              variant="outline"
                              className="border-purple-300 text-purple-600 hover:bg-purple-50"
                            >
                              <Play className="w-3 h-3" />
                            </Button>
                          </div>
                        )
                      } else if (line.speaker === 'user') {
                        const audio = getUserAudio(index)
                        
                        return (
                          <div key={`user-${index}`} className={`flex items-center justify-between p-2 rounded-lg border-l-4 ${
                            audio ? 'bg-green-50 border-green-400' : 'bg-gray-50 border-gray-300'
                          }`}>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                                  audio ? 'bg-green-500' : 'bg-gray-400'
                                }`}>
                                  <Mic className="w-2 h-2 text-white" />
                                </div>
                                <span className={`text-xs font-medium ${
                                  audio ? 'text-green-600' : 'text-gray-500'
                                }`}>あなた</span>
                              </div>
                              <p className={`text-sm font-medium ${
                                audio ? 'text-gray-800' : 'text-gray-500'
                              }`}>
                                ステップ {index + 1}: {audio ? '録音済み' : '未録音'}
                              </p>
                            </div>
                            {audio ? (
                              <Button
                                onClick={() => playUserAudio(index)}
                                size="sm"
                                variant="outline"
                                className="border-green-300 text-green-600 hover:bg-green-50"
                              >
                                <Play className="w-3 h-3" />
                              </Button>
                            ) : (
                              <Button
                                disabled
                                size="sm"
                                variant="outline"
                                className="border-gray-300 text-gray-400 opacity-50"
                              >
                                <Mic className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        )
                      }
                      return null
                    })}
                  </CardContent>
                </Card>
              )}
              
              <div className="flex gap-4">
                <Button
                  onClick={isPlayingDrama ? stopDramaPlayback : playDramaSequentially}
                  disabled={characterAudios.length === 0 && userAudios.length === 0}
                  className="flex-1 h-12 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white font-medium rounded-xl disabled:opacity-50"
                >
                  {isPlayingDrama ? (
                    <>
                      <div className="w-4 h-4 mr-2 bg-white rounded-sm animate-pulse" />
                      再生停止
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      {characterAudios.length > 0 || userAudios.length > 0 
                        ? `ドラマを再生 (${characterAudios.length + userAudios.length}音声)` 
                        : 'ドラマを再生（音声がありません）'
                      }
                    </>
                  )}
                </Button>
                
                <Button
                  onClick={handleReset}
                  variant="outline"
                  className="h-12 px-6 border-pink-300 text-pink-600 hover:bg-pink-50"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  最初から
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* エラー表示 */}
        {error && (
          <Card className="bg-red-50 border-red-200">
            <CardContent className="p-4">
              <p className="text-red-600 text-sm">
                エラーが発生しました: {error}
              </p>
            </CardContent>
          </Card>
        )}

        {/* ローディング表示 */}
        {isGeneratingAudio && (
          <div className="text-center space-y-4 py-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 border-4 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
            </div>
            <div className="space-y-2">
              <p className="text-pink-600 font-medium">音声を生成しています...</p>
              <p className="text-sm text-gray-500">少々お待ちください ♪</p>
            </div>
          </div>
        )}

        {/* Phase 3: 音声再生機能は各画面に統合されました */}

        {/* フッター */}
        <div className="text-center text-sm text-gray-500">
          <p>✨ 推しと一緒に、特別なドラマを作ろう ✨</p>
        </div>
      </div>
    </div>
  )
}
