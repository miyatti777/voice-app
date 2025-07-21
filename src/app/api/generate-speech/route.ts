import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json()

    if (!text) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      )
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      )
    }

    console.log('Gemini TTS API呼び出し:', { text, hasApiKey: !!apiKey });

    // 正しいGemini TTS APIを呼び出し
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: text
                }
              ]
            }
          ],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: "Kore"
                }
              }
            }
          }
        })
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Gemini TTS API error:', errorText)
      
      // より詳細なエラー情報を返す
      try {
        const errorData = JSON.parse(errorText)
        return NextResponse.json(
          { 
            error: `API request failed: ${response.status}`,
            details: errorData.error?.message || errorText
          },
          { status: response.status }
        )
      } catch {
        return NextResponse.json(
          { 
            error: `API request failed: ${response.status}`,
            details: errorText
          },
          { status: response.status }
        )
      }
    }

    const data = await response.json()
    console.log('TTS API response received, returning JSON with audio data');
    
    // 音声データがある場合、JSONとしてそのまま返す
    return NextResponse.json(data, { status: 200 })

  } catch (error) {
    console.error('Error in generate-speech API:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
} 