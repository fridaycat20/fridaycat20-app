import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
} from "firebase/auth";
import { Authenticator } from "remix-auth";
import { FormStrategy } from "remix-auth-form";
import { auth } from "~/lib/firebase";
import { createSessionCookie } from "~/lib/firebase-admin";

export interface User {
  id: string;
  email: string;
  sessionCookie?: string;
}

export const authenticator = new Authenticator<User>();

// Form Strategy for login
authenticator.use(
  new FormStrategy(async ({ form, request }) => {
    const email = form.get("email");
    const password = form.get("password");
    const action = form.get("_action");

    if (typeof email !== "string" || typeof password !== "string") {
      throw new Error("メールアドレスとパスワードが必要です");
    }

    if (!email || !password) {
      throw new Error("メールアドレスとパスワードを入力してください");
    }

    try {
      let userCredential: Awaited<
        ReturnType<typeof signInWithEmailAndPassword>
      >;

      if (action === "register") {
        userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
      } else {
        userCredential = await signInWithEmailAndPassword(
          auth,
          email,
          password,
        );
      }

      // IDトークンを取得してセッションクッキーを作成
      const idToken = await userCredential.user.getIdToken();
      const sessionCookie = await createSessionCookie(idToken);

      const user: User = {
        id: userCredential.user.uid,
        email: userCredential.user.email || email,
        ...(sessionCookie && { sessionCookie }),
      };

      return user;
    } catch (error: unknown) {
      if (error instanceof Error) {
        // Firebase specific error handling
        if (error.message.includes("email-already-in-use")) {
          throw new Error("このメールアドレスは既に使用されています");
        }
        if (error.message.includes("weak-password")) {
          throw new Error("パスワードは6文字以上で入力してください");
        }
        if (error.message.includes("invalid-email")) {
          throw new Error("有効なメールアドレスを入力してください");
        }
        if (error.message.includes("user-not-found") || error.message.includes("wrong-password")) {
          throw new Error("メールアドレスまたはパスワードが間違っています");
        }
        throw new Error(error.message);
      }
      throw new Error("認証に失敗しました");
    }
  }),
  "user-pass",
);
