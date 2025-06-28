import speech, { type protos } from "@google-cloud/speech";
import { GoogleGenAI } from "@google/genai";
import { saveComicToStorage } from "~/lib/firebase-admin";
import { getVerifiedUser } from "~/lib/session-utils.server";
import { imageProcessingService } from "~/services/image-processing.server";
import { translationService } from "~/services/translation.server";
import { visionService } from "~/services/vision.server";
import { ErrorMessage, EventType, ProcessingStatus } from "~/types/streaming";

export const action = async ({ request }: { request: Request }) => {
  const formData = await request.formData();
  const minutes = formData.get("minutes");
  const audioFile = formData.get("audioFile");

  const hasAudio = !!audioFile;
  let meetingMinutes = minutes ? minutes.toString().trim() : "";

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
            sendEvent(EventType.STATUS, ProcessingStatus.RECOGNIZING_SPEECH);
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
              meetingMinutes = response?.results
                ? response.results
                    .map((result) => result.alternatives?.[0].transcript)
                    .join(" ")
                : "";
            } catch (error) {
              console.error("音声認識エラー:", error);
              sendEvent(
                EventType.ERROR,
                ErrorMessage.SPEECH_RECOGNITION_FAILED,
              );
              return;
            }
          }

          // テキスト生成のステップ
          sendEvent(EventType.STATUS, ProcessingStatus.SUMMARIZING_CONTENT);
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
              {
                role: "user",
                parts: [{ text: meetingMinutes }],
              },
            ],
            config: {
              systemInstruction:
                'You are an expert 4-panel comic story writer. Create a 4-panel comic story from the input content with proper structure (introduction, development, climax, conclusion). Include specific dialogue in English, character actions, and scene descriptions for each panel. All dialogue must be in English and each speech bubble must contain no more than 30 words. Keep dialogue concise and impactful. Format your output as: Panel 1: [scene description] Character: "English dialogue", Panel 2: [scene description] Character: "English dialogue", Panel 3: [scene description] Character: "English dialogue", Panel 4: [scene description] Character: "English dialogue". Make it engaging and visual for comic illustration.',
              thinkingConfig: {
                thinkingBudget: 0,
              },
            },
          });

          // 画像生成のステップ - 4つの候補を生成
          sendEvent(EventType.STATUS, ProcessingStatus.GENERATING_COMIC);
          const generatedStory = response.text?.toString() ?? "";
          const imagePrompt = `Create exactly 4 panels arranged in a 2x2 grid layout for a 4-panel comic strip. Must have exactly 4 distinct panels with clear black borders separating each panel. Each panel should contain large rectangular white speech bubbles with black borders and sharp corners, with plenty of white space around the text for easy replacement. Each speech bubble should be rectangular or square-shaped with oversized margins around the text content. Avoid rounded or oval speech bubbles - use only rectangular shapes with straight edges and 90-degree corners. IMPORTANT: All text must appear ONLY inside speech bubbles. Do not add any text outside speech bubbles, no titles, no captions, no sound effects, no onomatopoeia, no panel numbers, no narrative text. Only dialogue text inside rectangular speech bubbles is allowed. The 4-panel comic should be based on: ${generatedStory}. Style: Clean manga/comic style with bold outlines, clear panel divisions in a 2x2 grid format, and spacious well-defined rectangular white speech bubbles with generous internal padding and sharp corners. Layout must be exactly 4 panels: top-left, top-right, bottom-left, bottom-right.`;

          const response2 = await ai.models.generateImages({
            model: "imagen-4.0-generate-preview-06-06",
            // model: "imagen-4.0-ultra-generate-preview-06-06",
            prompt: imagePrompt,
            config: {
              numberOfImages: 4,
            },
          });

          // 4つの画像から最適なものを選択
          sendEvent(EventType.STATUS, ProcessingStatus.SELECTING_BEST_IMAGE);
          let selectedImageBytes: string | null = null;

          if (
            response2?.generatedImages &&
            response2.generatedImages.length > 0
          ) {
            const images = response2.generatedImages
              .map((img) => img.image?.imageBytes)
              .filter((bytes): bytes is string => !!bytes);

            if (images.length === 1) {
              // 1つしかない場合はそれを使用
              selectedImageBytes = images[0];
            } else if (images.length > 1) {
              // 複数ある場合はGemini 2.5 Flashで最適なものを選択
              try {
                const evaluationResponse = await ai.models.generateContent({
                  model: "gemini-2.5-flash",
                  contents: [
                    {
                      role: "user",
                      parts: [
                        {
                          text: `以下は4コマ漫画として生成された画像の候補です。元のストーリー「${generatedStory}」に最も適合し、以下の条件を満たす画像を1つ選んでください：

1. 4つのパネルが明確に配置されている（2x2グリッド）
2. 各パネルに適切な吹き出しがある
3. ストーリーの流れに沿った構成になっている
4. 漫画として読みやすいレイアウト

最も良い画像の番号（1-${images.length}）のみを数字で回答してください。`,
                        },
                        ...images.map((imageBytes) => ({
                          inlineData: {
                            mimeType: "image/png",
                            data: imageBytes,
                          },
                        })),
                      ],
                    },
                  ],
                  config: {
                    thinkingConfig: {
                      thinkingBudget: 0,
                    },
                  },
                });

                const evaluationResult =
                  evaluationResponse.text?.toString().trim() || "1";

                // 数字のみの回答から番号を抽出
                const selectedNumber = Number.parseInt(evaluationResult) || 1;

                const selectedIndex = selectedNumber - 1;
                const finalIndex = Math.max(
                  0,
                  Math.min(selectedIndex, images.length - 1),
                );

                selectedImageBytes = images[finalIndex];
              } catch (evaluationError) {
                console.error("画像評価エラー:", evaluationError);
                // 評価に失敗した場合は最初の画像を使用
                selectedImageBytes = images[0];
              }
            }
          }

          // 選択された画像を使用
          const imageBytes = selectedImageBytes;

          // OCR処理を実行
          let ocrResult = null;
          let maskedImageBytes = null;
          let translatedImageBytes = null;
          if (imageBytes) {
            try {
              sendEvent(EventType.STATUS, ProcessingStatus.ANALYZING_IMAGE);
              const imageBuffer = Buffer.from(imageBytes, "base64");
              ocrResult = await visionService.detectText(imageBuffer);

              // テキスト領域が検出された場合の処理
              if (ocrResult && ocrResult.textAnnotations.length > 0) {
                // 白塗り画像を生成（元のOCR結果を使用）
                sendEvent(EventType.STATUS, ProcessingStatus.MASKING_TEXT);
                const maskResult =
                  await imageProcessingService.whiteMaskTextRegions(
                    imageBytes,
                    ocrResult.originalTextAnnotations,
                  );
                maskedImageBytes = maskResult.maskedImageBytes;

                // 英文を日本語に翻訳
                sendEvent(EventType.STATUS, ProcessingStatus.TRANSLATING_TEXT);
                const englishTexts = ocrResult.textAnnotations.map(
                  (annotation) => annotation.description,
                );
                const translationResult =
                  await translationService.translateTexts(englishTexts, meetingMinutes);

                // 翻訳されたテキストを画像に描画（結合後のOCR結果を使用）
                sendEvent(EventType.STATUS, ProcessingStatus.DRAWING_TEXT);
                const translatedResult =
                  await imageProcessingService.translateTextRegions(
                    maskedImageBytes,
                    ocrResult.textAnnotations,
                    translationResult.translatedTexts,
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
                generatedStory,
              );
            } catch (error) {
              console.error("画像保存エラー:", error);
              // 保存エラーでも画像は返す
            }
          }

          // 完了
          const completeData = {
            imageBytes: selectedImageBytes,
            generatedText: generatedStory,
            savedComic,
            ocrResult,
            maskedImageBytes,
            translatedImageBytes,
          };

          sendEvent(EventType.COMPLETE, JSON.stringify(completeData));
        } catch (error) {
          console.error("ストリーミング処理中にエラー:", error);
          sendEvent(EventType.ERROR, ErrorMessage.PROCESSING_ERROR);
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
