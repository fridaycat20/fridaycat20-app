import speech, { type protos } from "@google-cloud/speech";
import { GoogleGenAI } from "@google/genai";
import { saveComicToStorage } from "~/lib/firebase-admin";
import { getVerifiedUser } from "~/lib/session-utils.server";
import { visionService } from "~/services/vision.server";
import { imageProcessingService } from "~/services/image-processing.server";
import { translationService } from "~/services/translation.server";

export const action = async ({ request }: { request: Request }) => {
  const formData = await request.formData();
  const minutes = formData.get("minutes");
  const audioFile = formData.get("audioFile");

  let text = minutes ? minutes.toString().trim() : "";
  const hasAudio = !!audioFile;

  // セッションからユーザーを取得・検証
  const user = await getVerifiedUser(request);
  const userId = user?.id || null;

  // Server-Sent Eventsのヘッダーを設定
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (event: string, data: string) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${data}\n\n`),
        );
      };

      const processRequest = async () => {
        try {
          const ai = new GoogleGenAI({
            vertexai: true,
            location: "us-central1",
            project: "fridaycat20",
          });

          // 音声処理のステップ
          if (hasAudio && audioFile instanceof File) {
            sendEvent("status", "音声を認識中...");
            try {
              // Google Cloud Speech クライアントを作成
              const client = new speech.SpeechClient();

              // 音声ファイルをバッファに変換
              const arrayBuffer = await audioFile.arrayBuffer();
              const audioBytes = Buffer.from(arrayBuffer);

              // Speech-to-Text APIのリクエスト設定
              const speechRequest: protos.google.cloud.speech.v1.IRecognizeRequest =
                {
                  audio: {
                    content: audioBytes.toString("base64"),
                  },
                  config: {
                    encoding: "MP3",
                    sampleRateHertz: 16000,
                    languageCode: "ja-JP",
                  },
                };

              // Speech-to-Text APIで音声認識を実行
              const [response] = await client.recognize(speechRequest);
              text = response?.results
                ? response.results
                    .map((result) => result.alternatives?.[0].transcript)
                    .join(" ")
                : "";
            } catch (error) {
              console.error("音声認識エラー:", error);
              sendEvent("error", "音声認識に失敗しました。");
              return;
            }
          }

          // テキスト生成のステップ
          sendEvent("status", "内容を要約中...");
          const response = await ai.models.generateContent({
            model: "gemini-2.0-flash-001",
            contents: [
              {
                role: "user",
                parts: [{ text: text }],
              },
            ],
            config: {
              systemInstruction:
                "あなたは優秀な4コマ漫画のストーリーライターです。入力された内容を元に4コマ漫画を意識して起承転結にまとめることが得意です。出力は英語にしてください。",
            },
          });

          // 画像生成のステップ
          sendEvent("status", "4コマ漫画を生成中...");
          const response2 = await ai.models.generateImages({
            model: "imagen-4.0-generate-preview-05-20",
            prompt: `Please turn the following text into a 4-panel comic.：${response.text?.toString() ?? ""}`,
            config: {
              numberOfImages: 1,
            },
          });

          // 画像があればBase64エンコードされたデータを返す
          const imageBytes = response2?.generatedImages?.[0]?.image?.imageBytes;

          // OCR処理を実行
          let ocrResult = null;
          let maskedImageBytes = null;
          let translatedImageBytes = null;
          if (imageBytes) {
            try {
              sendEvent("status", "生成された画像を解析中...");
              const imageBuffer = Buffer.from(imageBytes, 'base64');
              ocrResult = await visionService.detectText(imageBuffer);
              
              // テキスト領域が検出された場合の処理
              if (ocrResult && ocrResult.textAnnotations.length > 0) {
                // 白塗り画像を生成
                sendEvent("status", "テキスト領域を白塗り中...");
                const maskResult = await imageProcessingService.whiteMaskTextRegions(imageBytes, ocrResult);
                maskedImageBytes = maskResult.maskedImageBytes;
                
                // 英文を日本語に翻訳
                sendEvent("status", "テキストを日本語に翻訳中...");
                const originalTexts = ocrResult.textAnnotations.map(annotation => annotation.description);
                const translationResult = await translationService.translateTexts(originalTexts);
                
                // 翻訳されたテキストを画像に描画
                sendEvent("status", "翻訳テキストを画像に描画中...");
                const translatedResult = await imageProcessingService.translateTextRegions(
                  imageBytes, 
                  ocrResult, 
                  translationResult.translatedTexts
                );
                translatedImageBytes = translatedResult.translatedImageBytes;
              }
            } catch (error) {
              console.error("OCR処理エラー:", error);
              // OCRエラーでも画像は返す
            }
          }

          // ログインユーザーの場合は画像を自動保存
          let savedComic = null;
          if (userId && imageBytes) {
            try {
              savedComic = await saveComicToStorage(
                userId,
                imageBytes,
                response.text?.toString() || "",
              );
            } catch (error) {
              console.error("画像保存エラー:", error);
              // 保存エラーでも画像は返す
            }
          }

          // 完了
          const completeData = {
            imageBytes: response2?.generatedImages?.[0]?.image?.imageBytes,
            generatedText: response.text,
            savedComic,
            ocrResult,
            maskedImageBytes,
            translatedImageBytes,
          };

          console.log("Complete data:", completeData);

          sendEvent("complete", JSON.stringify(completeData));
        } catch (error) {
          console.error("ストリーミング処理中にエラー:", error);
          sendEvent("error", "処理中にエラーが発生しました。");
        } finally {
          controller.close();
        }
      };

      processRequest();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
