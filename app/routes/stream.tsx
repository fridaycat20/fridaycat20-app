import { GoogleGenAI } from "@google/genai";

export const loader = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const minutes = url.searchParams.get("minutes");
  const hasAudio = url.searchParams.get("hasAudio") === "true";

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

          const text = minutes || "";

          // 音声処理のステップ（実際の実装では音声ファイルが必要）
          if (hasAudio) {
            sendEvent("status", "音声を認識中...");
            // ここで実際の音声認識処理を行う
            await new Promise((resolve) => setTimeout(resolve, 2000)); // デモ用の遅延
          }

          // テキスト生成のステップ
          sendEvent("status", "内容を要約中...");
          const response = await ai.models.generateContent({
            model: "gemini-2.0-flash-001",
            contents: text,
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

          // 完了
          sendEvent(
            "complete",
            JSON.stringify({
              imageBytes: response2?.generatedImages?.[0]?.image?.imageBytes,
              generatedText: response.text,
            }),
          );
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
