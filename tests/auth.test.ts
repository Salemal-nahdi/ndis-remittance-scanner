import { describe, expect, it } from "vitest";
import { isValidSession, sessionToken } from "@/lib/auth";

describe("session token", () => {
  it("is a base64url HMAC that changes with the password", async () => {
    process.env.SESSION_SECRET = "secret";
    process.env.APP_PASSWORD = "one";
    const a = await sessionToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await isValidSession(a)).toBe(true);
    process.env.APP_PASSWORD = "two";
    expect(await isValidSession(a)).toBe(false);
    expect(await isValidSession(undefined)).toBe(false);
  });
});
