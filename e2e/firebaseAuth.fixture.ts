// No production imports. Vite aliases this module only under --mode e2e.
type User = { uid: string; email: string; getIdToken: () => Promise<string> };
const listeners = new Set<(user: User | null) => void>();
const stored = sessionStorage.getItem("fixture-email");
const makeUser = (email: string): User => ({
  uid: email,
  email,
  getIdToken: async () => `fixture-${email}`,
});
const auth: { currentUser: User | null } = {
  currentUser: stored ? makeUser(stored) : null,
};
export function getAuth() {
  return auth;
}
export const browserLocalPersistence={type:'LOCAL'};
export async function setPersistence(){/* Identity is stored in sessionStorage only for browser fixtures. */}
export function connectAuthEmulator(){throw new Error('The e2e fixture does not connect to an emulator.');}
export function onAuthStateChanged(
  _auth: unknown,
  callback: (user: User | null) => void,
) {
  listeners.add(callback);
  queueMicrotask(() => callback(auth.currentUser));
  return () => listeners.delete(callback);
}
export async function signInWithEmailAndPassword(
  _auth: unknown,
  email: string,
  password: string,
) {
  if (password !== "fixture-password")
    throw { code: "auth/invalid-credential" };
  sessionStorage.setItem("fixture-email", email);
  auth.currentUser = makeUser(email);
  listeners.forEach((fn) => fn(auth.currentUser));
  return { user: auth.currentUser };
}
export const createUserWithEmailAndPassword = signInWithEmailAndPassword;
export async function signOut() {
  sessionStorage.removeItem("fixture-email");
  auth.currentUser = null;
  listeners.forEach((fn) => fn(null));
}
