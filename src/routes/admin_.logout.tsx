import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { clearAdminSession } from "~/lib/admin-auth";

const logout = createServerFn({ method: "GET" }).handler(async () => {
  await clearAdminSession();
});

export const Route = createFileRoute("/admin_/logout")({
  beforeLoad: async () => {
    await logout();
    throw redirect({ to: "/admin/login", search: { redirect: "/admin" } });
  },
});
