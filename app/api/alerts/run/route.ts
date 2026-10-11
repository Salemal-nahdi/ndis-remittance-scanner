import { NextResponse } from "next/server";
import { runAlertCheck } from "@/lib/run-alerts";

/** For an external scheduler: POST with "Authorization: Bearer $CRON_SECRET". */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json(await runAlertCheck());
}
