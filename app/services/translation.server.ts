import { GoogleGenAI } from "@google/genai";

export interface TranslationResult {
  originalTexts: string[];
  translatedTexts: string[];
}

export class TranslationService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({
      vertexai: true,
      location: "us-central1",
      project: "fridaycat20",
    });
  }

  async translateTexts(texts: string[]): Promise<TranslationResult> {
    try {
      if (texts.length === 0) {
        return {
          originalTexts: [],
          translatedTexts: [],
        };
      }

      // 全てのテキストを一度に翻訳
      const combinedText = texts.map((text, index) => `${index + 1}. ${text}`).join('\n');
      
      const response = await this.ai.models.generateContent({
        model: "gemini-2.0-flash-001",
        contents: [
          {
            role: "user",
            parts: [{ 
              text: `以下の英文を日本語に翻訳してください。漫画のセリフとして自然な日本語にしてください。番号付きで出力してください。

${combinedText}

出力形式:
1. [翻訳結果1]
2. [翻訳結果2]
...`
            }],
          },
        ],
        config: {
          systemInstruction: "あなたは優秀な翻訳者です。英文を自然な日本語に翻訳することが得意です。漫画のセリフとして違和感のない、読みやすい日本語に翻訳してください。",
        },
      });

      const translationText = response.text?.toString() || "";
      
      // 翻訳結果をパース
      const translatedTexts: string[] = [];
      const lines = translationText.split('\n');
      
      for (const line of lines) {
        const match = line.match(/^\d+\.\s*(.+)$/);
        if (match) {
          translatedTexts.push(match[1].trim());
        }
      }

      // 元のテキスト数と翻訳結果数が一致しない場合の補正
      while (translatedTexts.length < texts.length) {
        translatedTexts.push("");
      }

      return {
        originalTexts: texts,
        translatedTexts: translatedTexts.slice(0, texts.length),
      };
    } catch (error) {
      console.error('Translation error:', error);
      // エラー時は元のテキストをそのまま返す
      return {
        originalTexts: texts,
        translatedTexts: texts,
      };
    }
  }
}

export const translationService = new TranslationService();