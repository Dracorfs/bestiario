import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { setAdminSession } from "~/lib/admin-auth";
import { workos } from "~/lib/workos";

const exchangeCode = createServerFn({ method: "GET" })
  .inputValidator((input: { code: string; state?: string }) => input)
  .handler(async ({ data }) => {
    const { user } = await workos.userManagement.authenticateWithCode({
      code: data.code,
    });
    if (!user.emailVerified) {
      throw new Error("Email no verificado");
    }
    await setAdminSession(user.id, user.email);
    const isSafeRedirect = (path: string) =>
      path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\");
    const redirectTo =
      data.state && isSafeRedirect(data.state) ? data.state : "/admin";
    return { redirectTo };
  });

export const Route = createFileRoute("/admin_/callback")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: String(search.code ?? ""),
    state: typeof search.state === "string" ? search.state : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const { redirectTo } = await exchangeCode({
      data: { code: search.code, state: search.state },
    });
    throw redirect({ href: redirectTo });
  },
  errorComponent: CallbackError,
});

function CallbackError() {
  return (
    <>
      <h1>Error al iniciar sesión</h1>
      <p>No se pudo completar el inicio de sesión con Google.</p>
      <p>
        <a href="/admin/login" className="text-[--color-wiki-link] hover:underline">
          Volver a iniciar sesión
        </a>
      </p>
    </>
  );
}
