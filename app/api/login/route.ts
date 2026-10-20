import { handleLogin } from "@/lib/login-flow";

export const runtime = "nodejs";

/** Booking sign-in (home screen): the booking username + password set in Admin → Security. */
export function POST(req: Request) {
  return handleLogin(req, "user");
}
