import { NextResponse } from "next/server";
import { saveXeroConnection, seal } from "@/lib/store";
import { syncFromXero } from "@/lib/sync";
import { xeroClient } from "@/lib/xero";

export async function GET(req: Request) {
  const xero = xeroClient();
  await xero.initialize();
  const tokenSet = await xero.apiCallback(req.url);
  const tenants = await xero.updateTenants(false);
  const tenant = tenants[0];
  if (!tenant) return NextResponse.redirect(new URL("/?xero=no-organisation", req.url));

  await saveXeroConnection({ tokenSet: seal(tokenSet), tenantId: tenant.tenantId, tenantName: tenant.tenantName });
  await syncFromXero();
  return NextResponse.redirect(new URL("/receivables", req.url));
}
