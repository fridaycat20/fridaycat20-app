import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticator } from "~/lib/auth.server";
import { sessionStorage } from "~/lib/session.server";
import { RegisterForm } from "~/components/Auth/RegisterForm";

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
  const formData = await request.formData();
  formData.set("_action", "register");

  try {
    const user = await authenticator.authenticate("user-pass", request);

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
    return { error: "新規登録に失敗しました" };
  }
};

export default function Register() {
  return <RegisterForm />;
}
