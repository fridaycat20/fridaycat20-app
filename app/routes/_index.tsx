import { GoogleGenAI } from "@google/genai";
import { useCallback, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type { MetaFunction } from "react-router";
import { ConfirmModal } from "../components/ConfirmModal";
import { FileUploader } from "../components/FileUploader";

export const meta: MetaFunction = () => {
  return [
    { title: "MangaMaker - 議事録から4コマ漫画を自動生成" },
    {
      name: "description",
      content:
        "議事録を入力するだけで4コマ漫画を自動生成できるWebアプリ『MangaMaker』。会議内容を楽しく可視化！",
    },
  ];
};

export const action = async ({ request }: { request: Request }) => {
  const ai = new GoogleGenAI({
    vertexai: true,
    location: "us-central1",
    project: "fridaycat20",
  });

  const formData = await request.formData();
  const minutes = formData.get("minutes");

  // 議事録が空の場合は処理しない
  if (!minutes || minutes.toString().trim() === "") {
    return { error: "議事録を入力してください" };
  }

  try {
    // Geminiモデルでテキスト生成
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-001",
      contents: minutes.toString(),
      config: {
        systemInstruction:
          "あなたは優秀な4コマ漫画のストーリーライターです。入力された内容を元に4コマ漫画を意識して起承転結にまとめることが得意です。出力は英語にしてください。",
      },
    });

    // 生成されたテキストを元に画像生成
    const response2 = await ai.models.generateImages({
      model: "imagen-4.0-generate-preview-05-20",
      prompt: `Please turn the following text into a 4-panel comic.：${response.text?.toString() ?? ""}`,
      config: {
        numberOfImages: 1,
      },
    });

    // 画像があればBase64エンコードされたデータを返す
    const imageBytes = response2?.generatedImages?.[0]?.image?.imageBytes;

    return {
      imageBytes,
      generatedText: response.text,
    };
  } catch (error) {
    console.error("AI処理中にエラーが発生しました:", error);
    return {
      error: "AI処理中にエラーが発生しました。しばらくしてからお試しください。",
    };
  }
};

export const loader = async () => {
  return {};
};

export default function Index() {
  const fetcher = useFetcher();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showModal, setShowModal] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);

  // 画像URLの生成
  const imageUrl = useMemo(() => {
    const imageBytes = fetcher.data?.imageBytes;
    if (!imageBytes) return "";
    return `data:image/png;base64,${imageBytes}`;
  }, [fetcher.data?.imageBytes]);

  // エラーの取得
  const error = useMemo(() => {
    return fetcher.data?.error;
  }, [fetcher.data?.error]);

  // アップロードされたファイルのテキスト処理
  const handleTextLoaded = useCallback((text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // 既存テキストがあれば確認モーダルを表示
    if (textarea.value.trim() !== "") {
      setPendingText(text);
      setShowModal(true);
    } else {
      textarea.value = text;
    }
  }, []);

  // モーダルでOKを押したとき
  const handleModalOk = useCallback(() => {
    if (textareaRef.current && pendingText !== null) {
      textareaRef.current.value = pendingText;
    }
    setShowModal(false);
    setPendingText(null);
  }, [pendingText]);

  // モーダルでキャンセルを押したとき
  const handleModalCancel = useCallback(() => {
    setShowModal(false);
    setPendingText(null);
  }, []);

  return (
    <div className="max-w-5xl mx-auto p-8">
      <header className="flex items-center gap-2 py-4 justify-center">
        {/* Manga風の本のアイコン */}
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="inline align-middle"
        >
          <title>マンガ風の本のアイコン</title>
          <rect
            x="4"
            y="6"
            width="10"
            height="20"
            rx="2"
            fill="#f3f4f6"
            stroke="#22223b"
            strokeWidth="2"
          />
          <rect
            x="18"
            y="6"
            width="10"
            height="20"
            rx="2"
            fill="#f3f4f6"
            stroke="#22223b"
            strokeWidth="2"
          />
          <path d="M14 8L18 8" stroke="#22223b" strokeWidth="2" />
          <path d="M14 24L18 24" stroke="#22223b" strokeWidth="2" />
        </svg>
        <span className="font-bold text-2xl tracking-wide">MangaMaker</span>
      </header>
      <main className="mt-8">
        {/* ファイルアップローダー */}
        <div className="mb-4">
          <FileUploader onTextLoaded={handleTextLoaded} />
        </div>

        {/* 確認モーダル */}
        {showModal && (
          <ConfirmModal
            onCancel={handleModalCancel}
            onConfirm={handleModalOk}
          />
        )}

        {/* フォーム */}
        <fetcher.Form method="post" className="space-y-0">
          <label htmlFor="minutes" className="block font-bold mb-2">
            議事録を入力
          </label>
          <textarea
            id="minutes"
            name="minutes"
            rows={8}
            ref={textareaRef}
            className="w-full text-lg p-3 rounded-lg border border-gray-300 mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            placeholder="ここに議事録を入力してください"
          />

          {/* エラー表示 */}
          {error && <div className="text-red-500 mb-4">{error}</div>}

          <button
            type="submit"
            disabled={fetcher.state === "submitting"}
            className={`block w-full py-3 text-lg font-bold bg-gray-800 text-white border-none rounded-lg cursor-pointer mb-6 hover:bg-gray-700 transition ${
              fetcher.state === "submitting"
                ? "opacity-70 cursor-not-allowed"
                : ""
            }`}
          >
            {fetcher.state === "submitting"
              ? "生成中..."
              : "4コマ漫画を生成する"}
          </button>
        </fetcher.Form>

        {/* 画像表示エリア */}
        <div className="min-h-[320px] border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center bg-gray-50">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="4コマ漫画"
              className="max-h-80 object-contain"
            />
          ) : (
            <span className="text-gray-400">ここに4コマ漫画が表示されます</span>
          )}
        </div>
      </main>
    </div>
  );
}
