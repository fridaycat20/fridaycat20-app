import {
  ref,
  uploadBytes,
  getDownloadURL,
  listAll,
  getMetadata,
} from "firebase/storage";
import { storage } from "~/lib/firebase";

export interface ComicMetadata {
  id: string;
  createdAt: string;
  prompt: string;
  downloadURL: string;
  fileName: string;
}

export async function saveComic(
  userId: string,
  imageBytes: string,
  prompt: string,
): Promise<ComicMetadata> {
  const comicId = `comic_${Date.now()}`;
  const fileName = `${comicId}.png`;
  const filePath = `users/${userId}/comics/${fileName}`;

  // Convert base64 to blob
  const response = await fetch(`data:image/png;base64,${imageBytes}`);
  const blob = await response.blob();

  // Create storage reference
  const storageRef = ref(storage, filePath);

  // Upload with metadata
  const metadata = {
    customMetadata: {
      prompt,
      createdAt: new Date().toISOString(),
      comicId,
    },
  };

  const snapshot = await uploadBytes(storageRef, blob, metadata);
  const downloadURL = await getDownloadURL(snapshot.ref);

  return {
    id: comicId,
    createdAt: new Date().toISOString(),
    prompt,
    downloadURL,
    fileName,
  };
}
export async function getUserComics(userId: string): Promise<ComicMetadata[]> {
  const comicsRef = ref(storage, `users/${userId}/comics`);

  try {
    const result = await listAll(comicsRef);
    const comics: ComicMetadata[] = [];

    for (const itemRef of result.items) {
      const downloadURL = await getDownloadURL(itemRef);
      const metadata = await getMetadata(itemRef);

      comics.push({
        id: metadata.customMetadata?.comicId || itemRef.name,
        createdAt: metadata.customMetadata?.createdAt || metadata.timeCreated,
        prompt: metadata.customMetadata?.prompt || "",
        downloadURL,
        fileName: itemRef.name,
      });
    }

    // Sort by creation date (newest first)
    return comics.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  } catch (error) {
    console.error("Error fetching user comics:", error);
    return [];
  }
}
