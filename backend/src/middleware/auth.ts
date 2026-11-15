import { getFirebaseAdminAuth } from "../config/firebase.js";
import { hasCapability } from "../../../shared/permissions.js";
import type { RequestHandler } from "express";
import { db } from "../config/db.js";
import { ApiError } from "../services/errors.js";
export type Identity = {
  id: string;
  firebaseUid: string;
  email: string;
  name: string;
};
declare module "express-serve-static-core" {
  interface Request {
    identity: Identity;
    projectId: string;
    role: string;
  }
}
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new ApiError(401, "Sign in to continue");
    let decoded;
    try {
      decoded = await getFirebaseAdminAuth().verifyIdToken(token, true);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      const invalidCodes = [
        "auth/argument-error",
        "auth/invalid-argument",
        "auth/invalid-id-token",
        "auth/id-token-expired",
        "auth/id-token-revoked",
        "auth/user-disabled",
        "auth/user-not-found",
      ];
      throw new ApiError(
        invalidCodes.includes(code || "") ? 401 : 503,
        invalidCodes.includes(code || "")
          ? "Invalid or expired sign-in token"
          : "Authentication service is unavailable. Check the server Firebase configuration.",
      );
    }
    const user = await db.user.findUnique({
      where: { firebaseUid: decoded.uid },
    });
    if (!user)
      throw new ApiError(
        403,
        "Your account needs an invitation from a project administrator",
      );
    req.identity = user;
    next();
  } catch (error) {
    next(
      error instanceof ApiError
        ? error
        : new ApiError(
            503,
            "The account service is temporarily unavailable. Please try again later.",
          ),
    );
  }
};
export function membership(prisma: typeof db): RequestHandler {
  return async (req, _res, next) => {
    try {
      const projectId = String(req.params.projectId);
      const member = await prisma.projectMembership.findUnique({
        where: { projectId_userId: { projectId, userId: req.identity.id } },
      });
      if (!member || !hasCapability(member.role, "project:read"))
        throw new ApiError(403, "Project access denied");
      req.projectId = projectId;
      req.role = member.role;
      next();
    } catch (e) {
      next(e);
    }
  };
}
export const admin: RequestHandler = (req, _res, next) => {
  next(
    hasCapability(req.role, "project:manage")
      ? undefined
      : new ApiError(403, "Administrator access required"),
  );
};
