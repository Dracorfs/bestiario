import { redirect } from "@tanstack/react-router";
import {
  createMiddleware,
  createServerFn,
  createServerOnlyFn,
} from "@tanstack/react-start";

interface AdminSessionData {
  userId: string;
  email: string;
}

const getAdminSession = createServerOnlyFn(async () => {
  const { useSession } = await import("@tanstack/react-start/server");
  return useSession<AdminSessionData>({
    password: process.env.WORKOS_COOKIE_PASSWORD!,
    name: "admin_session",
    maxAge: 60 * 60 * 24 * 7,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  });
});

function isAllowedEmail(email: string): boolean {
  const allowlist = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.toLowerCase());
}

export async function setAdminSession(userId: string, email: string) {
  const session = await getAdminSession();
  await session.update({ userId, email });
}

export async function clearAdminSession() {
  const session = await getAdminSession();
  await session.clear();
}

export type AdminAuthResult =
  | { status: "unauthenticated" }
  | { status: "unauthorized"; email: string }
  | { status: "ok"; email: string };

export const checkAdminAuth = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminAuthResult> => {
    const session = await getAdminSession();
    const email = session.data.email;
    if (!email) return { status: "unauthenticated" };

    if (!isAllowedEmail(email)) {
      return { status: "unauthorized", email };
    }
    return { status: "ok", email };
  },
);

export const adminOnly = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const session = await getAdminSession();
    const email = session.data.email;
    if (!email || !isAllowedEmail(email)) {
      throw new Response("Forbidden", { status: 403 });
    }
    return next({ context: { email } });
  },
);

export async function requireAdmin(
  redirectTo: string,
): Promise<AdminAuthResult> {
  const result = await checkAdminAuth();
  if (result.status === "unauthenticated") {
    throw redirect({ to: "/admin/login", search: { redirect: redirectTo } });
  }
  return result;
}

export function NotAuthorized({ email }: { email: string }) {
  return (
    <>
      <h1>No autorizado</h1>
      <p>
        La cuenta <code>{email}</code> inició sesión correctamente pero no
        está en la lista de administradores.
      </p>
      <p>
        <a
          href="/admin/logout"
          className="text-[--color-wiki-link] hover:underline"
        >
          Cerrar sesión
        </a>
      </p>
    </>
  );
}
