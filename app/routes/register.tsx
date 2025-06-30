import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { RegisterForm } from "~/components/Auth/RegisterForm";
import { authenticator } from "~/lib/auth.server";
import { sessionStorage } from "~/lib/session.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Check if user is already authenticated
  const session = await sessionStorage.getSession(
    request.headers.get("Cookie"),
  );
  const user = session.get("user");
  if (user) {
    throw redirect("/");
  }
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    // まず元のリクエストからフォームデータを取得
    const originalFormData = await request.formData();
    const email = originalFormData.get("email");
    const password = originalFormData.get("password");

    // 新しいFormDataを作成して必要なフィールドを設定
    const formData = new FormData();
    formData.set("email", email as string);
    formData.set("password", password as string);
    formData.set("_action", "register");

    // 新しいリクエストを作成
    const newRequest = new Request(request.url, {
      method: "POST",
      body: formData,
    });

    const user = await authenticator.authenticate("user-pass", newRequest);

    // Create session
    const session = await sessionStorage.getSession(
      request.headers.get("Cookie"),
    );
    session.set("user", user);

    throw redirect("/", {
      headers: {
        "Set-Cookie": await sessionStorage.commitSession(session),
      },
    });
  } catch (error) {
    // Handle authentication errors
    if (error instanceof Response) {
      throw error; // Re-throw redirect responses
    }
    console.error("Registration error:", error);

    // エラーメッセージをより具体的に
    if (error instanceof Error) {
      return { error: error.message };
    }
    return { error: "新規登録に失敗しました" };
  }
};

export default function Register() {
  return <RegisterForm />;
}
