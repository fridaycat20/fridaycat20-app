import * as fs from "node:fs";
import { GoogleGenAI, Modality } from "@google/genai";
import { useRef } from "react";
import { useFetcher } from "react-router";
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

export const action = async ({ request }: { request: Request }) => {
  const ai = new GoogleGenAI({
    vertexai: true,
    location: "us-central1",
    project: "fridaycat20",
  });

  const formData = await request.formData();
  const minutes = formData.get("minutes");

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash-001",
    contents: minutes?.toString() ?? "",
    config: {
      systemInstruction:
        "あなたは優秀な4コマ漫画のストーリーライターです。入力された内容を元に4コマ漫画を意識して起承転結にまとめることが得意です。",
    },
  });

  console.log(response.text);
  const response2 = await ai.models.generateImages({
    model: "imagen-4.0-generate-preview-05-20",
    prompt: response.text?.toString() ?? "",
    config: {
      numberOfImages: 1,
    },
  });
  console.log(response2?.generatedImages?.[0]?.image?.imageBytes);

  // ここで minutes を使って4コマ漫画を生成する処理を追加
  return {
    imageUrl: "https://growthseed.jp/wp-content/uploads/2016/12/peach-1.jpg",
  };
};

export const loader = async () => {
  return {};
};

export default function Index() {
  const fetcher = useFetcher();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageUrl = fetcher.data?.imageUrl ?? "";

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
          <button
            type="submit"
            className="block w-full py-3 text-lg font-bold bg-gray-800 text-white border-none rounded-lg cursor-pointer mb-6 hover:bg-gray-700 transition"
          >
            4コマ漫画を生成する
          </button>
        </fetcher.Form>
        <div className="min-h-[320px] border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center bg-gray-50">
          {/* 生成された4コマ漫画画像をここに表示 */}
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
