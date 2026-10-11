import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  if (await isValidSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  // The scheduled alert check (CRON_SECRET) and Xero webhooks (signed) authenticate themselves.
  matcher: ["/((?!login|api/login|api/alerts/run|api/xero/webhook|_next|favicon.ico).*)"],
};
