import { verifySessionCookie } from "~/lib/firebase-admin";
import { sessionStorage } from "~/lib/session.server";
import type { User } from "~/lib/auth.server";

export interface VerifiedUser {
  id: string;
  email: string;
}

export async function getVerifiedUser(
  request: Request,
): Promise<VerifiedUser | null> {
  const session = await sessionStorage.getSession(
    request.headers.get("Cookie"),
  );
  const user = session.get("user") as User | null;

  // ユーザーがいない場合はnullを返す
  if (!user) {
    return null;
  }

  // Firebase Admin SDKでセッションクッキーを検証（sessionCookieがある場合のみ）
  if (user.sessionCookie) {
    try {
      const verifiedUser = await verifySessionCookie(user.sessionCookie);
      if (!verifiedUser) {
        return null;
      }
      return verifiedUser;
    } catch (error) {
      console.error("Session verification failed:", error);
      return null;
    }
  }

  // sessionCookieがない場合は従来のユーザー情報を返す（後方互換性）
  return { id: user.id, email: user.email };
}

export async function requireAuth(request: Request): Promise<VerifiedUser> {
  const user = await getVerifiedUser(request);
  if (!user) {
    throw new Response(null, {
      status: 302,
      headers: {
        Location: "/login",
      },
    });
  }
  return user;
}
