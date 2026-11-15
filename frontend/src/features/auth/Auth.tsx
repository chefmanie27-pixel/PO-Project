import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  type User,
} from "@firebase/auth";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  configured,
  initializeFirebaseAuth,
  getFirebaseAuth,
  authErrorMessage,
} from "../../services/firebase";
export { configured } from "../../services/firebase";
const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  error: string | null;
}>({
  user: null,
  loading: true,
  error: null,
});
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(configured);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void initializeFirebaseAuth()
      .then((auth) => {
        if (cancelled) return;
        unsubscribe = onAuthStateChanged(
          auth,
          (u) => {
            queryClient.clear();
            setUser(u);
            setLoading(false);
            setError(null);
          },
          () => {
            queryClient.clear();
            setUser(null);
            setLoading(false);
            setError(
              "Your sign-in session could not be restored. Refresh and sign in again.",
            );
          },
        );
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          setError(
            "Authentication could not initialize. Check the Firebase configuration and browser storage permissions.",
          );
        }
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [queryClient]);
  return (
    <AuthContext.Provider value={{ user, loading, error }}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  return useContext(AuthContext);
}
export async function logout() {
  await signOut(getFirebaseAuth());
}
export function SignOutButton({
  children = "Sign out",
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <button
        className={className}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError("");
          void logout()
            .catch(() => setError("Sign-out failed. Please try again."))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Signing out…" : children}
      </button>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </>
  );
}
export function Protected({ children }: { children: ReactNode }) {
  const { user, loading, error } = useAuth();
  if (error)
    return (
      <main className="setup">
        <p role="alert">{error}</p>
        <button onClick={() => window.location.reload()}>Reload sign-in</button>
      </main>
    );
  if (loading)
    return (
      <main className="auth">
        <p role="status">Checking your session…</p>
      </main>
    );
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}
const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters"),
});
export function Login() {
  const registerPage = useLocation().pathname === "/register";
  const { user, error: sessionError } = useAuth();
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  if (user) return <Navigate to="/projects" replace />;
  return (
    <main className="auth">
      <div className="auth-story">
        <span className="eyebrow">PRODUCT OPERATIONS, CONNECTED</span>
        <h1>
          One backlog.
          <br />A clearer direction.
        </h1>
        <p>A shared workspace for the people shaping what comes next.</p>
        <div className="auth-line" />
        <small>PO COMMAND CENTER</small>
      </div>
      <section className="auth-card">
        <div className="brand-mark">
          P<span>O</span>
        </div>
        <h2>{registerPage ? "Create your account" : "Welcome back"}</h2>
        <p className="muted">
          {registerPage
            ? "An administrator must grant project access after registration."
            : "Sign in to your product workspace."}
        </p>
        {!configured && (
          <div className="notice">
            Firebase setup required. Add VITE_FIREBASE_API_KEY,
            VITE_FIREBASE_AUTH_DOMAIN and VITE_FIREBASE_PROJECT_ID to
            frontend/.env. See README.md.
          </div>
        )}
        <form
          onSubmit={handleSubmit(async (values) => {
            setError("");
            try {
              const auth = await initializeFirebaseAuth();
              await (
                registerPage
                  ? createUserWithEmailAndPassword
                  : signInWithEmailAndPassword
              )(auth, values.email, values.password);
            } catch (e) {
              setError(authErrorMessage(e));
            }
          })}
        >
          <label>
            Email address
            <input autoComplete="email" type="email" {...register("email")} />
            {errors.email && <small role="alert">{errors.email.message}</small>}
          </label>
          <label>
            Password
            <input
              autoComplete={registerPage ? "new-password" : "current-password"}
              type="password"
              {...register("password")}
            />
            {errors.password && (
              <small role="alert">{errors.password.message}</small>
            )}
          </label>
          {(error || sessionError) && (
            <p role="alert" className="error-text">
              {error || sessionError}
            </p>
          )}
          <button
            className="primary full"
            disabled={!configured || isSubmitting}
          >
            {isSubmitting
              ? "Please wait…"
              : registerPage
                ? "Create account"
                : "Sign in to workspace"}{" "}
            <span>→</span>
          </button>
        </form>
        <p className="muted">
          {registerPage ? "Already have an account?" : "New to the workspace?"}{" "}
          <Link to={registerPage ? "/login" : "/register"}>
            {registerPage ? "Sign in" : "Create account"}
          </Link>
        </p>
      </section>
    </main>
  );
}
