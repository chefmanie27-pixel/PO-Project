import React from "react";
import { vi, describe, it, expect, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
const { signIn } = vi.hoisted(() => {
  vi.stubEnv("VITE_FIREBASE_API_KEY", "fixture-key");
  vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "fixture");
  vi.stubEnv("VITE_FIREBASE_AUTH_DOMAIN", "fixture.invalid");
  return {
    signIn: vi.fn().mockRejectedValue({ code: "auth/invalid-credential" }),
  };
});
vi.stubEnv("VITE_FIREBASE_API_KEY", "fixture-key");
vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "fixture");
vi.stubEnv("VITE_FIREBASE_AUTH_DOMAIN", "fixture.invalid");
vi.mock("@firebase/app", () => ({
  initializeApp: () => ({ options: { projectId: "fixture" } }),
  getApps: () => [],
  getApp: () => ({ options: { projectId: "fixture" } }),
}));
vi.mock("../src/services/firebaseConfig", () => ({
  firebaseConfig: {
    apiKey: "fixture-key",
    projectId: "fixture",
    authDomain: "fixture.invalid",
  },
}));
vi.mock("@firebase/auth", () => ({
  getAuth: () => ({}),
  signInWithEmailAndPassword: signIn,
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: () => () => {},
  setPersistence: vi.fn().mockResolvedValue(undefined),
  browserLocalPersistence: { type: "LOCAL" },
  connectAuthEmulator: vi.fn(),
}));
import { Login } from "../src/features/auth/Auth";
afterEach(cleanup);
describe("Login form", () => {
  it("validates credentials before authentication", async () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "short" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Sign in to workspace/ }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("at least 8"),
    );
    expect(signIn).not.toHaveBeenCalled();
  });
  it("shows a clear authentication error", async () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Sign in to workspace/ }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Email or password is incorrect.",
      ),
    );
  });
});
