import { useCallback, useMemo, useRef, useState } from "react";
import type { MetaFunction } from "react-router";
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

export default function Index() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showModal, setShowModal] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  // 現在選択中のタブを管理する状態
  const [activeTab, setActiveTab] = useState<InputTab>("text");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  // ローディングステータスの管理
  const [loadingStatus, setLoadingStatus] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamResult, setStreamResult] = useState<{
    imageBytes?: string;
    generatedText?: string;
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

  // 画像URLの生成
  const imageUrl = useMemo(() => {
    const imageBytes = streamResult?.imageBytes;
    if (!imageBytes) return "";
    return `data:image/png;base64,${imageBytes}`;
  }, [streamResult?.imageBytes]);

  // エラーの取得
  const error = useMemo(() => {
    if (loadingStatus.includes("エラー")) {
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

  // 画像ダウンロードのハンドラ
  const handleDownloadImage = useCallback(() => {
    if (!streamResult?.imageBytes) return;

    try {
      // base64文字列をBlobに変換
      const byteCharacters = atob(streamResult.imageBytes);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "image/png" });

      // ダウンロード用のリンクを作成
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `4コマ漫画_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("画像のダウンロード中にエラーが発生しました:", error);
    }
  }, [streamResult?.imageBytes]);

  // ストリーミング処理の開始
  const startStreaming = useCallback((minutes: string, hasAudio: boolean) => {
    setIsStreaming(true);
    setLoadingStatus("");
    setStreamResult(null);

    const params = new URLSearchParams({
      minutes: minutes,
      hasAudio: hasAudio.toString(),
    });

    const eventSource = new EventSource(`/stream?${params}`);

    eventSource.addEventListener("status", (e) => {
      setLoadingStatus((e as MessageEvent).data);
    });

    eventSource.addEventListener("complete", (e) => {
      try {
        const result = JSON.parse((e as MessageEvent).data);
        setStreamResult(result);
        setIsStreaming(false);
        setLoadingStatus("");
      } catch (error) {
        console.error("結果のパース中にエラー:", error);
        setLoadingStatus("結果の処理中にエラーが発生しました。");
        setIsStreaming(false);
      }
      eventSource.close();
    });

    eventSource.addEventListener("error", (e) => {
      setLoadingStatus((e as MessageEvent).data || "エラーが発生しました。");
      setIsStreaming(false);
      eventSource.close();
    });

    eventSource.onerror = () => {
      setLoadingStatus("接続エラーが発生しました。");
      setIsStreaming(false);
      eventSource.close();
    };
  }, []);

  // フォーム送信のハンドラ
  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (activeTab === "text") {
        const minutes = textareaRef.current?.value?.trim() || "";
        if (!minutes) {
          setLoadingStatus("議事録を入力してください。");
          return;
        }
        startStreaming(minutes, false);
      } else if (activeTab === "audio" && audioFile) {
        // 音声ファイルの場合は、ファイルを読み込んでからストリーミングを開始
        // 実際の実装では、音声ファイルをサーバーにアップロードしてから処理する必要があります
        startStreaming("", true);
      }
    },
    [activeTab, audioFile, startStreaming],
  );

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
        <div className="min-h-[320px] border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center bg-gray-50">
          {isStreaming ? (
            <div className="flex flex-col items-center justify-center space-y-4">
              {/* ローディングスピナー */}
              <div className="relative">
                <div className="w-12 h-12 border-4 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
              </div>
              {/* ローディングメッセージ */}
              <div className="text-center">
                <p className="text-gray-600 text-lg font-medium">
                  {loadingStatus || "4コマ漫画を生成中..."}
                </p>
                <p className="text-gray-500 text-sm mt-1">
                  しばらくお待ちください
                </p>

                {/* 進捗インジケーター */}
                <div className="mt-3 flex justify-center space-x-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      loadingStatus.includes("音声") ||
                      loadingStatus.includes("要約") ||
                      loadingStatus.includes("生成")
                        ? "bg-gray-800"
                        : "bg-gray-300"
                    }`}
                  />
                  <div
                    className={`w-2 h-2 rounded-full ${
                      loadingStatus.includes("要約") ||
                      loadingStatus.includes("生成")
                        ? "bg-gray-800"
                        : "bg-gray-300"
                    }`}
                  />
                  <div
                    className={`w-2 h-2 rounded-full ${
                      loadingStatus.includes("生成")
                        ? "bg-gray-800"
                        : "bg-gray-300"
                    }`}
                  />
                </div>
              </div>
            </div>
          ) : imageUrl ? (
            <div className="flex flex-col items-center space-y-4">
              <img
                src={imageUrl}
                alt="4コマ漫画"
                className="max-h-80 object-contain"
              />
              <button
                type="button"
                onClick={handleDownloadImage}
                className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
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
                画像をダウンロード
              </button>
            </div>
          ) : (
            <span className="text-gray-400">ここに4コマ漫画が表示されます</span>
          )}
        </div>
      </main>
    </div>
  );
}
