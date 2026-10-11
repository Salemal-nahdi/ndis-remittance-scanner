/** Session cookie for the shared app password. Uses Web Crypto so it also runs in the proxy. */
export const SESSION_COOKIE = "session";

async function hmac(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(process.env.SESSION_SECRET ?? ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Buffer.from(sig).toString("base64url");
}

export async function sessionToken(): Promise<string> {
  return hmac(`app:${process.env.APP_PASSWORD ?? ""}`);
}

export async function isValidSession(token: string | undefined): Promise<boolean> {
  return !!token && !!process.env.SESSION_SECRET && token === (await sessionToken());
}
