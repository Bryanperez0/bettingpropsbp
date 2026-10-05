import { describe, expect, it } from "vitest";
import { isSignedIn } from "../server/auth";
import { handle } from "../server/respond";

const req = (headers: Record<string, string> = {}) => new Request("https://example.test/api/props", { headers });

describe("API sign-in check", () => {
  it("rejects a request with no token", async () => {
    expect(await isSignedIn(req())).toBe(false);
  });

  it("rejects a malformed token", async () => {
    expect(await isSignedIn(req({ authorization: "Bearer not-a-jwt" }))).toBe(false);
  });

  it("handle() returns 401 and never runs the handler when signed out", async () => {
    let ran = false;
    const fn = handle(async () => { ran = true; return new Response("ok"); });
    const res = await fn(req(), {});
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(ran).toBe(false);
  });
});
