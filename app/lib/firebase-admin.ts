import { initializeApp, getApps, type App } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";
import admin from "firebase-admin";

let adminApp: App;

if (getApps().length === 0) {
  adminApp = initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: "fridaycat20.firebasestorage.app",
  });
} else {
  adminApp = getApps()[0];
}

export const adminStorage = getStorage(adminApp);
export const adminAuth = getAuth(adminApp);

export async function verifySessionCookie(
  sessionCookie: string,
): Promise<{ id: string; email: string } | null> {
  try {
    const decodedClaims = await adminAuth.verifySessionCookie(
      sessionCookie,
      true,
    );
    return {
      id: decodedClaims.uid,
      email: decodedClaims.email || "",
    };
  } catch (error) {
    console.error("Session cookie verification failed:", error);
    return null;
  }
}

export async function createSessionCookie(
  idToken: string,
  expiresIn: number = 60 * 60 * 24 * 5 * 1000,
): Promise<string | null> {
  try {
    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn,
    });
    return sessionCookie;
  } catch (error) {
    console.error("Session cookie creation failed:", error);
    return null;
  }
}

export interface ComicMetadata {
  id: string;
  createdAt: string;
  prompt: string;
  downloadURL: string;
  fileName: string;
  userId: string;
}

export async function saveComicToStorage(
  userId: string,
  imageBytes: string,
  prompt: string,
): Promise<ComicMetadata> {
  const comicId = `comic_${Date.now()}`;
  const fileName = `${comicId}.png`;
  const filePath = `users/${userId}/comics/${fileName}`;

  // Convert base64 to buffer
  const buffer = Buffer.from(imageBytes, "base64");

  // Get bucket and file reference
  const bucket = adminStorage.bucket();
  const file = bucket.file(filePath);

  // Upload with metadata
  await file.save(buffer, {
    metadata: {
      contentType: "image/png",
      metadata: {
        prompt,
        createdAt: new Date().toISOString(),
        comicId,
        userId,
      },
    },
  });

  // Make file publicly readable
  await file.makePublic();

  // Get download URL
  const downloadURL = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

  return {
    id: comicId,
    createdAt: new Date().toISOString(),
    prompt,
    downloadURL,
    fileName,
    userId,
  };
}

export async function getUserComics(userId: string): Promise<ComicMetadata[]> {
  try {
    const bucket = adminStorage.bucket();
    const [files] = await bucket.getFiles({
      prefix: `users/${userId}/comics/`,
    });

    const comics: ComicMetadata[] = [];

    for (const file of files) {
      if (file.name.endsWith('.png')) {
        const [metadata] = await file.getMetadata();
        const downloadURL = `https://storage.googleapis.com/${bucket.name}/${file.name}`;

        comics.push({
          id: String(metadata.metadata?.comicId || file.name.split('/').pop()?.replace('.png', '') || ''),
          createdAt: String(metadata.metadata?.createdAt || metadata.timeCreated || new Date().toISOString()),
          prompt: String(metadata.metadata?.prompt || ''),
          downloadURL,
          fileName: file.name.split('/').pop() || '',
          userId,
        });
      }
    }

    // Sort by creation date (newest first)
    return comics.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (error) {
    console.error('Error fetching user comics:', error);
    return [];
  }
}
