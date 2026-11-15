import type { Auth } from "firebase-admin/auth";
import { getFirebaseAdminAuth } from "../config/firebase.js";
import { ApiError } from "./errors.js";

export async function validateInvitedIdentity(
  uid: string,
  email: string,
  auth?: Pick<Auth, "getUser">,
): Promise<void> {
  let account;
  try {
    account = await (auth ?? getFirebaseAdminAuth()).getUser(uid);
  } catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found")
      throw new ApiError(
        400,
        "Register this account with Firebase before granting project access.",
      );
    throw new ApiError(
      503,
      "Could not verify the invited account. Check the server Firebase configuration.",
    );
  }
  if (
    account.disabled ||
    !account.email ||
    account.email.toLowerCase() !== email.toLowerCase()
  )
    throw new ApiError(
      400,
      "The email and UID must match an active Firebase account.",
    );
}
