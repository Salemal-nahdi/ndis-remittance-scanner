import { NextResponse } from "next/server";
import { seal, updateStore } from "@/lib/store";
import { syncFromXero } from "@/lib/sync";
import { xeroClient } from "@/lib/xero";

export async function GET(req: Request) {
  const xero = xeroClient();
  await xero.initialize();
  const tokenSet = await xero.apiCallback(req.url);
  const tenants = await xero.updateTenants(false);
  const tenant = tenants[0];
  if (!tenant) return NextResponse.redirect(new URL("/?xero=no-organisation", req.url));

  await updateStore((d) => {
    d.xero = { tokenSet: seal(tokenSet), tenantId: tenant.tenantId, tenantName: tenant.tenantName };
    delete d.snapshot;
  });
  await syncFromXero();
  return NextResponse.redirect(new URL("/receivables", req.url));
}
