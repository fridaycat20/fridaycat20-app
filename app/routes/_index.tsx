import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { Logo } from "~/components/Logo";
import { getVerifiedUser } from "~/lib/session-utils.server";
import { sessionStorage } from "~/lib/session.server";
import {
  ErrorMessage,
  EventType,
  type LoadingStatus,
  ProcessingStatus,
} from "~/types/streaming";
import { ConfirmModal } from "../components/ConfirmModal";
import { FileUploader } from "../components/FileUploader";

// タブの種類を定義
type InputTab = "text" | "audio";
type ImageTab = "original" | "masked" | "translated";

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

  // セッションが期限切れの場合はログインページにリダイレクト
  if (!user) {
    const session = await sessionStorage.getSession(
      request.headers.get("Cookie"),
    );
    const storedUser = session.get("user");

    // セッションにユーザーがいたが検証に失敗した場合（期限切れ）
    if (storedUser) {
      throw new Response(null, {
        status: 302,
        headers: {
          Location: "/login",
          "Set-Cookie": await sessionStorage.destroySession(session),
        },
      });
    }
  }

  return { user };
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
  // 画像表示タブの状態（翻訳版をデフォルトに）
  const [activeImageTab, setActiveImageTab] = useState<ImageTab>("translated");
  // ローディングステータスの管理
  const [loadingStatus, setLoadingStatus] = useState<LoadingStatus>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamResult, setStreamResult] = useState<{
    imageBytes?: string;
    generatedText?: string;
    translatedImageBytes?: string;
    ocrResult?: {
      fullText: string;
      textAnnotations: Array<{
        description: string;
        boundingPoly: {
          vertices: Array<{
            x: number;
            y: number;
          }>;
        };
      }>;
    };
  } | null>(null);

  // 音声ファイルが選択されたときのハンドラ
  const handleAudioFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      setAudioFile(file);
    }
  };

  // サンプルテキスト読み込み関数
  const loadSampleText = useCallback(async (filename: string) => {
    try {
      const response = await fetch(`/${filename}`);
      const text = await response.text();
      if (textareaRef.current) {
        textareaRef.current.value = text;
      }
    } catch (error) {
      console.error("Failed to load sample text:", error);
    }
  }, []);

  // 画像URLの生成
  const imageUrl = useMemo(() => {
    const imageBytes = streamResult?.imageBytes;
    if (!imageBytes) return "";
    return `data:image/png;base64,${imageBytes}`;
  }, [streamResult?.imageBytes]);


  // 翻訳画像URLの生成
  const translatedImageUrl = useMemo(() => {
    const translatedImageBytes = streamResult?.translatedImageBytes;
    if (!translatedImageBytes) return "";
    return `data:image/png;base64,${translatedImageBytes}`;
  }, [streamResult?.translatedImageBytes]);


  // エラーの取得
  const error = useMemo(() => {
    if (typeof loadingStatus === "string" && loadingStatus.includes("エラー")) {
      return loadingStatus;
    }
    return "";
  }, [loadingStatus]);

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

  // ストリーミング処理の開始
  const startStreaming = useCallback((formData: FormData) => {
    setIsStreaming(true);
    setLoadingStatus("");
    setStreamResult(null);

    // POSTリクエストでストリーミングを開始
    fetch("/stream", {
      method: "POST",
      body: formData,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No reader available");
        }

        const decoder = new TextDecoder();

        let currentEvent = "";
        let buffer = "";

        const readStream = () => {
          reader
            .read()
            .then(({ done, value }) => {
              if (done) {
                setIsStreaming(false);
                return;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");

              // 最後の行は不完全な可能性があるので保持
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (line.startsWith("event: ")) {
                  currentEvent = line.slice(7);
                  continue;
                }

                if (line.startsWith("data: ")) {
                  const data = line.slice(6);

                  if (currentEvent === EventType.STATUS) {
                    setLoadingStatus(data);
                  } else if (currentEvent === EventType.COMPLETE) {
                    try {
                      const result = JSON.parse(data);
                      setStreamResult(result);
                      setIsStreaming(false);
                      setLoadingStatus("");
                    } catch (error) {
                      console.error("結果のパース中にエラー:", error);
                      console.error("Raw data:", data);
                      setLoadingStatus(ErrorMessage.RESULT_PARSING_ERROR);
                      setIsStreaming(false);
                    }
                  } else if (currentEvent === EventType.ERROR) {
                    setLoadingStatus(data || ErrorMessage.GENERAL_ERROR);
                    setIsStreaming(false);
                  }

                  currentEvent = ""; // リセット
                }
              }

              readStream();
            })
            .catch((error) => {
              console.error("ストリーミング読み込みエラー:", error);
              setLoadingStatus(ErrorMessage.CONNECTION_ERROR);
              setIsStreaming(false);
            });
        };

        readStream();
      })
      .catch((error) => {
        console.error("ストリーミング開始エラー:", error);
        setLoadingStatus(ErrorMessage.CONNECTION_ERROR);
        setIsStreaming(false);
      });
  }, []);

  // フォーム送信のハンドラ
  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const formData = new FormData(form);

      if (activeTab === "text") {
        const minutes = textareaRef.current?.value?.trim() || "";
        if (!minutes) {
          setLoadingStatus(ErrorMessage.INPUT_REQUIRED);
          return;
        }
        formData.set("minutes", minutes);
      } else if (activeTab === "audio" && audioFile) {
        formData.set("audioFile", audioFile);
      } else {
        setLoadingStatus(ErrorMessage.VALIDATION_ERROR);
        return;
      }

      startStreaming(formData);
    },
    [activeTab, audioFile, startStreaming],
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

              {/* サンプル議事録ボタン */}
              <div className="mb-4">
                <p className="block font-bold mb-2">サンプル議事録</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => loadSampleText("sample1.txt")}
                    className="px-4 py-2 text-sm font-medium text-white bg-gray-800 hover:bg-gray-700 rounded-md transition-colors"
                  >
                    商品企画会議
                  </button>
                  <button
                    type="button"
                    onClick={() => loadSampleText("sample2.txt")}
                    className="px-4 py-2 text-sm font-medium text-white bg-gray-800 hover:bg-gray-700 rounded-md transition-colors"
                  >
                    システム開発会議
                  </button>
                  <button
                    type="button"
                    onClick={() => loadSampleText("sample3.txt")}
                    className="px-4 py-2 text-sm font-medium text-white bg-gray-800 hover:bg-gray-700 rounded-md transition-colors"
                  >
                    マーケティング会議
                  </button>
                  <button
                    type="button"
                    onClick={() => loadSampleText("sample4.txt")}
                    className="px-4 py-2 text-sm font-medium text-white bg-gray-800 hover:bg-gray-700 rounded-md transition-colors"
                  >
                    人事制度会議
                  </button>
                </div>
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
            disabled={isStreaming || (activeTab === "audio" && !audioFile)}
            className={`block w-full py-3 text-lg font-bold bg-gray-800 text-white border-none rounded-lg cursor-pointer mb-6 hover:bg-gray-700 transition ${
              isStreaming || (activeTab === "audio" && !audioFile)
                ? "opacity-70 cursor-not-allowed"
                : ""
            }`}
          >
            {isStreaming ? "生成中..." : "4コマ漫画を生成する"}
          </button>
        </form>

        {/* 画像表示エリア */}
        <div className="min-h-[576px] border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center bg-gray-50 gap-4">
          {isStreaming ? (
            <div className="flex flex-col items-center justify-center space-y-4">
              {/* ローディングスピナー */}
              <div className="relative">
                <div className="w-12 h-12 border-4 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
              </div>
              {/* ローディングメッセージ */}
              <div className="text-center">
                <p className="text-gray-600 text-lg font-medium">
                  {loadingStatus || ProcessingStatus.GENERATING_COMIC}
                </p>
                <p className="text-gray-500 text-sm mt-1">
                  しばらくお待ちください
                </p>

                {/* 進捗インジケーター */}
                <div className="mt-3 flex justify-center space-x-2">
                  {Object.values(ProcessingStatus).map((status, index) => {
                    const isActive =
                      Object.values(ProcessingStatus).indexOf(
                        loadingStatus as ProcessingStatus,
                      ) >= index;
                    return (
                      <div
                        key={status}
                        className={`w-2 h-2 rounded-full ${
                          isActive ? "bg-gray-800" : "bg-gray-300"
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          ) : imageUrl ? (
            <div className="flex flex-col items-center space-y-4 w-full">
              {/* 画像タブUI */}
              <div className="flex mb-4 border-b border-gray-200">
                {translatedImageUrl && (
                  <button
                    type="button"
                    className={`py-2 px-4 font-medium text-lg ${
                      activeImageTab === "translated"
                        ? "border-b-2 border-gray-800 text-gray-800"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                    onClick={() => setActiveImageTab("translated")}
                  >
                    日本語版
                  </button>
                )}
                <button
                  type="button"
                  className={`py-2 px-4 font-medium text-lg ${
                    activeImageTab === "original"
                      ? "border-b-2 border-gray-800 text-gray-800"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                  onClick={() => setActiveImageTab("original")}
                >
                  オリジナル
                </button>
              </div>

              {/* 画像表示 */}
              {activeImageTab === "translated" && !translatedImageUrl ? (
                <div className="flex flex-col items-center justify-center h-[576px] bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg">
                  <div className="text-gray-500 text-lg mb-2">📷</div>
                  <div className="text-gray-600 text-center">
                    <p className="font-medium">日本語版画像がありません</p>
                    <p className="text-sm mt-1">オリジナルタブで画像をご確認ください</p>
                  </div>
                </div>
              ) : (
                <img
                  src={
                    activeImageTab === "translated" && translatedImageUrl
                      ? translatedImageUrl
                      : imageUrl
                  }
                  alt={
                    activeImageTab === "translated" && translatedImageUrl
                      ? "日本語版4コマ漫画"
                      : "4コマ漫画"
                  }
                  className="max-h-[576px] object-contain"
                />
              )}

              {/* ボタン群 */}
              <div className="flex gap-2">
                {fetcher.data?.savedComic && (
                  <div className="px-4 py-2 bg-green-100 text-green-800 rounded-md border border-green-300">
                    ✓ 保存済み
                  </div>
                )}
                <a
                  href={
                    activeImageTab === "translated" && translatedImageUrl
                      ? translatedImageUrl
                      : imageUrl
                  }
                  download={
                    activeImageTab === "translated" && translatedImageUrl
                      ? "4comic-manga-japanese.png"
                      : "4comic-manga.png"
                  }
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  <svg
                    className="w-5 h-5 inline mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <title>ダウンロードアイコン</title>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  {activeImageTab === "translated" && translatedImageUrl
                    ? "日本語版をダウンロード"
                    : "画像をダウンロード"}
                </a>
              </div>
            </div>
          ) : (
            <span className="text-gray-400">ここに4コマ漫画が表示されます</span>
          )}
        </div>
      </main>
    </div>
  );
}
