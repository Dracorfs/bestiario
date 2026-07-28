import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { workos } from "~/lib/workos";

const getGoogleAuthUrl = createServerFn({ method: "GET" })
  .inputValidator((redirectTo: string) => redirectTo)
  .handler(async ({ data: redirectTo }) => {
    return workos.userManagement.getAuthorizationUrl({
      provider: "GoogleOAuth",
      redirectUri: process.env.WORKOS_REDIRECT_URI!,
      state: redirectTo,
    });
  });

export const Route = createFileRoute("/admin/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : "/admin",
  }),
  component: LoginPage,
});

function LoginPage() {
  const { redirect: redirectTo } = Route.useSearch();
  return (
    <>
      <h1>Acceso administrador</h1>
      <button
        type="button"
        className="border border-[--color-wiki-border] px-4 py-1 bg-[--color-wiki-sidebar] hover:bg-white"
        onClick={async () => {
          const url = await getGoogleAuthUrl({ data: redirectTo });
          window.location.href = url;
        }}
      >
        Continuar con Google
      </button>
    </>
  );
}
