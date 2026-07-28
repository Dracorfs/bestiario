import { redirect } from "@tanstack/react-router";
import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";

interface AdminSessionData {
  userId: string;
  email: string;
}

const getAdminSession = createServerOnlyFn(async () => {
  const { useSession } = await import("@tanstack/react-start/server");
  return useSession<AdminSessionData>({
    password: process.env.WORKOS_COOKIE_PASSWORD!,
    name: "admin_session",
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  });
});

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

    const allowlist = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (!allowlist.includes(email.toLowerCase())) {
      return { status: "unauthorized", email };
    }
    return { status: "ok", email };
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
