import { createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { getXeroConnection } from "@/lib/store";
import { syncFromXero } from "@/lib/sync";

interface XeroWebhook {
  events?: { tenantId: string; eventCategory: string }[];
}

/**
 * Xero calls this when invoices or contacts change, so payments show up within
 * seconds instead of at the next refresh. Set up in the Xero developer portal
 * (Webhooks: Invoices and Contacts, delivery URL $APP_URL/api/xero/webhook) and
 * put the webhook key in XERO_WEBHOOK_KEY.
 *
 * Xero requires a 200 for correctly signed requests and a 401 otherwise, with
 * no body, within 5 seconds, so the sync runs after the response.
 */
export async function POST(req: Request) {
  const key = process.env.XERO_WEBHOOK_KEY;
  const body = await req.text();
  const expected = Buffer.from(createHmac("sha256", key ?? "").update(body).digest("base64"));
  const given = Buffer.from(req.headers.get("x-xero-signature") ?? "");
  if (!key || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new Response(null, { status: 401 });
  }

  const events = (JSON.parse(body) as XeroWebhook).events ?? [];
  if (events.length > 0) {
    after(async () => {
      const connection = await getXeroConnection();
      if (connection && events.some((e) => e.tenantId === connection.tenantId)) {
        await syncFromXero().catch((err) => console.error("Webhook-triggered Xero sync failed", err));
      }
    });
  }
  return new Response(null, { status: 200 });
}
