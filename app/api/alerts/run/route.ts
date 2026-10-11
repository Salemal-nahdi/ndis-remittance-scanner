import { NextResponse } from "next/server";
import { runAlertCheck } from "@/lib/run-alerts";

/**
 * For a scheduler: send "Authorization: Bearer $CRON_SECRET". Vercel Cron
 * (see vercel.json) calls it with GET and adds that header itself.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json(await runAlertCheck());
}

export const GET = handle;
export const POST = handle;
// Fetching from Xero and sending email can take a while on a large organisation.
export const maxDuration = 60;
