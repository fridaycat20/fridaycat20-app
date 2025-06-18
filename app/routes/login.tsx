import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { LoginForm } from "~/components/Auth/LoginForm";
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
    if (error instanceof Error) {
      return { error: error.message };
    }
    throw error;
  }
};

export default function Login() {
  return <LoginForm />;
}
