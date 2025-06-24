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
      console.error("Session cookie verification failed:", error);
      // セッションクッキーが期限切れの場合はnullを返す（自動ログアウト）
      return null;
    }
  }

  // sessionCookieがない場合は従来のユーザー情報を返す（後方互換性）
  return { id: user.id, email: user.email };
}

export async function requireAuth(request: Request): Promise<VerifiedUser> {
  const user = await getVerifiedUser(request);
  if (!user) {
    // セッションが無効な場合はクッキーをクリアしてログインページにリダイレクト
    const session = await sessionStorage.getSession(
      request.headers.get("Cookie"),
    );
    
    throw new Response(null, {
      status: 302,
      headers: {
        Location: "/login",
        "Set-Cookie": await sessionStorage.destroySession(session),
      },
    });
  }
  return user;
}

export async function clearExpiredSession(request: Request): Promise<Headers | null> {
  const session = await sessionStorage.getSession(
    request.headers.get("Cookie"),
  );
  const user = session.get("user") as User | null;

  if (user?.sessionCookie) {
    try {
      await verifySessionCookie(user.sessionCookie);
      return null; // セッションは有効
    } catch (error) {
      console.error("Clearing expired session:", error);
      // セッションクッキーが期限切れの場合はセッションをクリア
      const headers = new Headers();
      headers.set("Set-Cookie", await sessionStorage.destroySession(session));
      return headers;
    }
  }
  
  return null; // セッションクッキーがない場合は何もしない
}
