/**
 * Netlify scheduled function: starts the daily overdue check.
 *
 * Scheduled functions stop after 30 seconds, so this only calls the app's
 * /api/alerts/run endpoint, which runs as a normal request with up to 60
 * seconds. It stops waiting after 25 seconds; the check carries on regardless.
 */
export default async function dailyAlerts(): Promise<Response> {
  const appUrl = process.env.APP_URL ?? process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!appUrl || !secret) {
    console.error("APP_URL and CRON_SECRET must be set for the daily alert check");
    return new Response("Not configured", { status: 500 });
  }

  try {
    const res = await fetch(new URL("/api/alerts/run", appUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(25_000),
    });
    const body = await res.text();
    if (!res.ok) console.error(`Alert check failed: ${res.status} ${body}`);
    else console.log(`Alert check finished: ${body}`);
    return new Response(body, { status: res.status });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      console.log("Alert check still running after 25s; it will finish on its own");
      return new Response("Started", { status: 202 });
    }
    throw err;
  }
}

// 21:50 UTC is 8:50am in Sydney during daylight saving and 7:50am otherwise.
export const config = { schedule: "50 21 * * *" };
