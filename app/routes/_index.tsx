import type { MetaFunction } from "react-router";

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
        <label htmlFor="minutes" className="block font-bold mb-2">
          議事録を入力
        </label>
        <textarea
          id="minutes"
          name="minutes"
          rows={8}
          className="w-full text-lg p-3 rounded-lg border border-gray-300 mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          placeholder="ここに議事録を入力してください"
        />
        <button
          type="button"
          className="block w-full py-3 text-lg font-bold bg-gray-800 text-white border-none rounded-lg cursor-pointer mb-6 hover:bg-gray-700 transition"
        >
          4コマ漫画を生成する
        </button>
        <div className="min-h-[320px] border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center bg-gray-50">
          {/* 生成された4コマ漫画画像をここに表示 */}
          <span className="text-gray-400">ここに4コマ漫画が表示されます</span>
        </div>
      </main>
    </div>
  );
}
