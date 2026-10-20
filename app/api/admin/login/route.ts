import { handleLogin } from "@/lib/login-flow";

export const runtime = "nodejs";

/** Admin sign-in: ADMIN_USERNAME + ADMIN_PASSWORD (+ 2FA code when on). */
export function POST(req: Request) {
  return handleLogin(req, "admin");
}
