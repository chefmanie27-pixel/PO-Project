import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { getFirebaseAdminAuth } from "../src/config/firebase.js";
import { authenticate, membership, admin } from "../src/middleware/auth.js";
import express from "express";
import { db } from "../src/config/db.js";
import { getApps, deleteApp } from "firebase-admin/app";

const projectId = "00000000-0000-4000-8000-000000000001";
let token: string, uid: string;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
beforeAll(async () => {
  if (!authHost || !/^(127\.0\.0\.1|localhost):\d+$/.test(authHost))
    throw new Error(
      "Run this suite through the loopback Firebase Auth emulator, never a live project.",
    );
  const response = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `po-${crypto.randomUUID()}@example.invalid`,
        password: "local-emulator-password",
        returnSecureToken: true,
      }),
    },
  );
  expect(response.ok).toBe(true);
  const result = await response.json();
  token = result.idToken;
  uid = result.localId;
});
afterAll(async () => {
  vi.restoreAllMocks();
  await Promise.all(getApps().map((app) => deleteApp(app)));
  await db.$disconnect();
});

describe("Real Firebase Auth emulator with fixture database membership", () => {
  it("verifies a real emulator-issued identity token with revocation checking", async () => {
    const decoded = await getFirebaseAdminAuth().verifyIdToken(token, true);
    expect(decoded.uid).toBe(uid);
  });
  it("supports email/password sign-in and refresh tokens", async () => {
    const account = await getFirebaseAdminAuth().getUser(uid);
    const response = await fetch(
      `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: account.email,
          password: "local-emulator-password",
          returnSecureToken: true,
        }),
      },
    );
    expect(response.ok).toBe(true);
    const session = await response.json();
    const refresh = await fetch(
      `http://${authHost}/securetoken.googleapis.com/v1/token?key=demo-key`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: session.refreshToken,
        }),
      },
    );
    expect(refresh.ok).toBe(true);
    const next = await refresh.json();
    expect(
      (await getFirebaseAdminAuth().verifyIdToken(next.id_token, true)).uid,
    ).toBe(uid);
  });
  it("still denies a registered Firebase user without a database approval", async () => {
    const lookup = vi.spyOn(db.user, "findUnique").mockResolvedValue(null);
    const app = express();
    app.get("/private", authenticate, (_req, res) =>
      res.json({ private: true }),
    );
    app.use((e: any, _req: any, res: any, _next: any) =>
      res.status(e.status || 500).json({ error: e.message }),
    );
    const response = await request(app)
      .get("/private")
      .set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(403);
    expect(lookup).toHaveBeenCalledWith({ where: { firebaseUid: uid } });
    lookup.mockRestore();
  });
  it("enforces project and admin permissions after real token verification", async () => {
    const lookup = vi
      .spyOn(db.user, "findUnique")
      .mockResolvedValue({
        id: "po",
        firebaseUid: uid,
        email: "po@example.invalid",
        name: "PO",
      } as any);
    const member = vi.fn().mockResolvedValue({ role: "PRODUCT_OWNER" });
    const app = express();
    app.use(authenticate);
    app.get(
      "/projects/:projectId",
      membership({ projectMembership: { findUnique: member } } as any),
      (_req, res) => res.json({ allowed: true }),
    );
    app.post(
      "/projects/:projectId/memberships",
      membership({ projectMembership: { findUnique: member } } as any),
      admin,
      (_req, res) => res.json({ allowed: true }),
    );
    app.use((e: any, _req: any, res: any, _next: any) =>
      res.status(e.status || 500).json({ error: e.message }),
    );
    expect(
      (
        await request(app)
          .get(`/projects/${projectId}`)
          .set("Authorization", `Bearer ${token}`)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post(`/projects/${projectId}/memberships`)
          .set("Authorization", `Bearer ${token}`)
          .send({ role: "ADMIN" })
      ).status,
    ).toBe(403);
    member.mockResolvedValue(null);
    expect(
      (
        await request(app)
          .get(`/projects/${projectId}`)
          .set("Authorization", `Bearer ${token}`)
      ).status,
    ).toBe(403);
    lookup.mockRestore();
  });
  it("rejects disabled emulator users", async () => {
    await getFirebaseAdminAuth().updateUser(uid, { disabled: true });
    await expect(
      getFirebaseAdminAuth().verifyIdToken(token, true),
    ).rejects.toMatchObject({ code: "auth/user-disabled" });
    await getFirebaseAdminAuth().updateUser(uid, { disabled: false });
  });
});

describe("Firestore local default-deny rules", () => {
  const documents = [
    "users/po",
    "teams/team-a/members/po",
    "teams/team-b/decisions/private",
    "projects/project-a/blockers/private",
    "tickets/private",
    "meetingNotes/private",
  ];
  it("requires a local Firestore emulator for rule evaluation", () => {
    expect(firestoreHost).toMatch(/^(127\.0\.0\.1|localhost):\d+$/);
  });
  it.each(documents)(
    "denies anonymous and signed-in reads/writes for %s",
    async (path) => {
      if (!firestoreHost) throw new Error("Firestore emulator is required.");
      const url = `http://${firestoreHost}/v1/projects/demo-po-command-center/databases/(default)/documents/${path}`;
      for (const bearer of [undefined, token]) {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (bearer) headers.Authorization = `Bearer ${bearer}`;
        for (const method of ["GET", "PATCH", "DELETE"]) {
          const response = await fetch(url, {
            method,
            headers,
            ...(method === "PATCH"
              ? {
                  body: JSON.stringify({
                    fields: { role: { stringValue: "ADMIN" } },
                  }),
                }
              : {}),
          });
          expect(response.status).toBe(403);
        }
      }
    },
  );
});
