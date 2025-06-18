import speech, { type protos } from "@google-cloud/speech";
import { GoogleGenAI } from "@google/genai";
import { useCallback, useMemo, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { Logo } from "~/components/Logo";
import { saveComicToStorage } from "~/lib/firebase-admin";
import { getVerifiedUser } from "~/lib/session-utils.server";
import { ConfirmModal } from "../components/ConfirmModal";
import { FileUploader } from "../components/FileUploader";

// タブの種類を定義
type InputTab = "text" | "audio";

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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await getVerifiedUser(request);
  return { user };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const ai = new GoogleGenAI({
    vertexai: true,
    location: "us-central1",
    project: "fridaycat20",
  });

  const formData = await request.formData();
  const minutes = formData.get("minutes");
  const audioFile = formData.get("audioFile");

  // セッションからユーザーを取得・検証
  const user = await getVerifiedUser(request);
  const userId = user?.id || null;

  // 議事録 または 音声ファイルが送信されていない場合はエラー
  if ((!minutes || minutes.toString().trim() === "") && !audioFile) {
    return { error: "議事録または音声ファイルを入力してください。" };
  }

  let text = minutes ? minutes.toString().trim() : "";

  // 音声ファイルが送信された場合、Google Cloud Speech-to-Text APIで処理
  if (audioFile && audioFile instanceof File) {
    try {
      // Google Cloud Speech クライアントを作成
      const client = new speech.SpeechClient();

      // 音声ファイルをバッファに変換
      const arrayBuffer = await audioFile.arrayBuffer();
      const audioBytes = Buffer.from(arrayBuffer);

      // Speech-to-Text APIのリクエスト設定
      const request: protos.google.cloud.speech.v1.IRecognizeRequest = {
        audio: {
          content: audioBytes.toString("base64"),
        },
        config: {
          encoding: "MP3", // 音声ファイルのエンコーディング形式
          sampleRateHertz: 16000, // 音声ファイルのサンプリングレート
          languageCode: "ja-JP", // 日本語の音声認識
        },
      };

      // Speech-to-Text APIで音声認識を実行
      const [response] = await client.recognize(request);
      console.log("音声認識結果:", response);

      text = response?.results
        ? response.results
            .map((result) => result.alternatives?.[0].transcript)
            .join(" ")
        : "";
      console.log("音声認識されたテキスト:", text);
    } catch (error) {
      console.error("音声認識エラー:", error);
      return {
        error: "音声認識に失敗しました。",
      };
    }
  }

  try {
    // Geminiモデルでテキスト生成
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-001",
      contents: text,
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

    return {
      imageBytes,
      generatedText: response.text,
      savedComic,
    };
  } catch (error) {
    console.error("AI処理中にエラーが発生しました:", error);
    return {
      error: "AI処理中にエラーが発生しました。しばらくしてからお試しください。",
    };
  }
};

export default function Index() {
  const { user } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showModal, setShowModal] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  // 現在選択中のタブを管理する状態
  const [activeTab, setActiveTab] = useState<InputTab>("text");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  // 音声ファイルが選択されたときのハンドラ
  const handleAudioFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      setAudioFile(file);
    }
  };

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

  // remix-authを使用したフォーム送信
  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const formData = new FormData(form);
      fetcher.submit(formData, { method: "POST" });
    },
    [fetcher],
  );

  return (
    <div className="max-w-5xl mx-auto p-8">
      <header className="flex items-center justify-between py-4">
        <div className="flex items-center gap-2">
          <Logo className="inline align-middle" />
          <span className="font-bold text-2xl tracking-wide">MangaMaker</span>
        </div>
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <a
                href="/gallery"
                className="text-sm text-indigo-600 hover:text-indigo-800"
              >
                ギャラリー
              </a>
              <span className="text-sm text-gray-600">{user.email}</span>
              <form method="POST" action="/logout" className="inline">
                <button
                  type="submit"
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  ログアウト
                </button>
              </form>
            </>
          ) : (
            <div className="flex gap-2">
              <a
                href="/login"
                className="text-sm text-indigo-600 hover:text-indigo-800"
              >
                ログイン
              </a>
              <span className="text-sm text-gray-300">|</span>
              <a
                href="/register"
                className="text-sm text-indigo-600 hover:text-indigo-800"
              >
                新規登録
              </a>
            </div>
          )}
        </div>
      </header>
      <main className="mt-8">
        {/* 確認モーダル */}
        {showModal && (
          <ConfirmModal
            onCancel={handleModalCancel}
            onConfirm={handleModalOk}
          />
        )}

        {/* タブUI */}
        <div className="flex mb-4 border-b border-gray-200">
          <button
            type="button"
            className={`py-2 px-4 font-medium text-lg ${
              activeTab === "text"
                ? "border-b-2 border-gray-800 text-gray-800"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("text")}
          >
            議事録入力
          </button>
          <button
            type="button"
            className={`py-2 px-4 font-medium text-lg ${
              activeTab === "audio"
                ? "border-b-2 border-gray-800 text-gray-800"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("audio")}
          >
            音声入力
          </button>
        </div>

        {/* フォーム */}
        <form onSubmit={handleSubmit} className="space-y-0">
          {/* テキスト入力タブパネル */}
          {activeTab === "text" && (
            <>
              {/* ファイルアップローダー */}
              <div className="mb-4">
                <FileUploader onTextLoaded={handleTextLoaded} />
              </div>

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
            </>
          )}

          {/* 音声入力タブパネル */}
          {activeTab === "audio" && (
            <>
              <label htmlFor="audio-file" className="block font-bold mb-2">
                音声ファイルをアップロード
              </label>
              <input
                id="audio-file"
                name="audioFile"
                type="file"
                accept="audio/mp3"
                onChange={handleAudioFileChange}
                className="block w-full text-lg p-3 rounded-lg border border-gray-300 mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </>
          )}

          {/* エラー表示 */}
          {error && <div className="text-red-500 mb-4">{error}</div>}

          <button
            type="submit"
            disabled={
              fetcher.state === "submitting" ||
              (activeTab === "audio" && !audioFile)
            }
            className={`block w-full py-3 text-lg font-bold bg-gray-800 text-white border-none rounded-lg cursor-pointer mb-6 hover:bg-gray-700 transition ${
              fetcher.state === "submitting" ||
              (activeTab === "audio" && !audioFile)
                ? "opacity-70 cursor-not-allowed"
                : ""
            }`}
          >
            {fetcher.state === "submitting"
              ? "生成中..."
              : "4コマ漫画を生成する"}
          </button>
        </form>

        {/* 画像表示エリア */}
        <div className="min-h-[320px] border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center bg-gray-50 gap-4">
          {imageUrl ? (
            <>
              <img
                src={imageUrl}
                alt="4コマ漫画"
                className="max-h-80 object-contain"
              />
              <div className="flex gap-2">
                {fetcher.data?.savedComic && (
                  <div className="px-4 py-2 bg-green-100 text-green-800 rounded-md border border-green-300">
                    ✓ 保存済み
                  </div>
                )}
                <a
                  href={imageUrl}
                  download="4comic-manga.png"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  ダウンロード
                </a>
              </div>
            </>
          ) : (
            <span className="text-gray-400">ここに4コマ漫画が表示されます</span>
          )}
        </div>
      </main>
    </div>
  );
}
