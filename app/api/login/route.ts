import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";

export async function POST(req: Request) {
  const form = await req.formData();
  const ok = process.env.APP_PASSWORD && form.get("password") === process.env.APP_PASSWORD;
  const res = NextResponse.redirect(new URL(ok ? "/" : "/login?error=1", req.url), 303);
  if (ok) {
    res.cookies.set(SESSION_COOKIE, await sessionToken(), {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30, path: "/",
    });
  }
  return res;
}
