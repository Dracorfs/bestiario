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
    await setAdminSession(user.id, user.email);
    const isSafeRedirect = (path: string) =>
      path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\");
    const redirectTo =
      data.state && isSafeRedirect(data.state) ? data.state : "/admin";
    return { redirectTo };
  });

export const Route = createFileRoute("/admin/callback")({
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
});
