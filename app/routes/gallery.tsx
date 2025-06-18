import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { getUserComics, type ComicMetadata } from "~/services/storageService";
import { Logo } from "~/components/Logo";
import { requireAuth } from "~/lib/session-utils.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await requireAuth(request);

  try {
    const comics = await getUserComics(user.id);
    return { user, comics };
  } catch (error) {
    console.error("Failed to load comics:", error);
    return { user, comics: [] };
  }
};

export default function Gallery() {
  const { user, comics: initialComics } = useLoaderData<typeof loader>();
  const [comics] = useState<ComicMetadata[]>(initialComics);

  return (
    <div className="max-w-5xl mx-auto p-8">
      <header className="flex items-center justify-between py-4">
        <div className="flex items-center gap-2">
          <a href="/" className="flex items-center gap-2">
            <Logo className="inline align-middle" />
            <span className="font-bold text-2xl tracking-wide">MangaMaker</span>
          </a>
        </div>
        <div className="flex items-center gap-4">
          <a href="/" className="text-sm text-indigo-600 hover:text-indigo-800">
            ホーム
          </a>
          <span className="text-sm text-gray-600">{user.email}</span>
        </div>
      </header>

      <main className="mt-8">
        <h1 className="text-3xl font-bold mb-8">あなたの4コマ漫画ギャラリー</h1>

        {comics.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-500 mb-4">
              まだ保存された画像がありません
            </div>
            <a
              href="/"
              className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              4コマ漫画を作成する
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {comics.map((comic) => (
              <div
                key={comic.id}
                className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200"
              >
                <img
                  src={comic.downloadURL}
                  alt="4コマ漫画"
                  className="w-full h-48 object-cover"
                />
                <div className="p-4">
                  <div className="text-sm text-gray-500 mb-2">
                    {new Date(comic.createdAt).toLocaleDateString("ja-JP", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  {comic.prompt && (
                    <div className="text-sm text-gray-700 mb-3 line-clamp-3">
                      {comic.prompt}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <a
                      href={comic.downloadURL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-center px-3 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700"
                    >
                      拡大表示
                    </a>
                    <a
                      href={comic.downloadURL}
                      download={comic.fileName}
                      className="flex-1 text-center px-3 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
                    >
                      ダウンロード
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
