import { describe, it, expect, vi } from "vitest";
import { validateInvitedIdentity } from "../src/services/invitations.js";
describe("Trusted membership approval", () => {
  it("verifies the existing Firebase UID/email before adding membership", async () => {
    const getUser = vi
      .fn()
      .mockResolvedValue({ email: "Ada@Example.com", disabled: false });
    await expect(
      validateInvitedIdentity("trusted-uid", "ada@example.com", { getUser }),
    ).resolves.toBeUndefined();
    expect(getUser).toHaveBeenCalledWith("trusted-uid");
  });
  it("rejects mismatched and disabled identities", async () => {
    for (const account of [
      { email: "other@example.com", disabled: false },
      { email: "ada@example.com", disabled: true },
    ])
      await expect(
        validateInvitedIdentity("uid", "ada@example.com", {
          getUser: vi.fn().mockResolvedValue(account),
        }),
      ).rejects.toMatchObject({ status: 400 });
  });
  it("never creates a Firebase account for an unknown invitation", async () => {
    await expect(
      validateInvitedIdentity("unknown", "ada@example.com", {
        getUser: vi.fn().mockRejectedValue({ code: "auth/user-not-found" }),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("keeps credential and permission failures out of API messages", async () => {
    await expect(
      validateInvitedIdentity("uid", "ada@example.com", {
        getUser: vi
          .fn()
          .mockRejectedValue(new Error("private server credential")),
      }),
    ).rejects.toMatchObject({
      status: 503,
      message:
        "Could not verify the invited account. Check the server Firebase configuration.",
    });
  });
});
