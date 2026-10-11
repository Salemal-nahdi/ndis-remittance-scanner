import { NextResponse } from "next/server";
import { xeroClient } from "@/lib/xero";

export async function GET() {
  const xero = xeroClient();
  await xero.initialize();
  return NextResponse.redirect(await xero.buildConsentUrl());
}
