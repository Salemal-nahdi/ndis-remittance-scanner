/** Session cookie for the shared app password. Web APIs only, so it also runs in the proxy on edge runtimes. */
export const SESSION_COOKIE = "session";

async function hmac(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(process.env.SESSION_SECRET ?? ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  // base64url without Buffer, which edge runtimes (e.g. Netlify's) may not provide.
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sessionToken(): Promise<string> {
  return hmac(`app:${process.env.APP_PASSWORD ?? ""}`);
}

export async function isValidSession(token: string | undefined): Promise<boolean> {
  return !!token && !!process.env.SESSION_SECRET && token === (await sessionToken());
}
