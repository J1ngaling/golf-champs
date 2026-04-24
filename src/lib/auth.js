// src/lib/auth.js
// A lightweight admin gate — just a PIN stored in sessionStorage.
// Not cryptographically secure, but totally fine for a private friends' league.
// Set your PIN as NEXT_PUBLIC_ADMIN_PIN in your Vercel environment variables.

const PIN = process.env.NEXT_PUBLIC_ADMIN_PIN || "1234";
const SESSION_KEY = "gc_admin";

export function isAdmin() {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(SESSION_KEY) === PIN;
}

export function attemptLogin(input) {
  if (input === PIN) {
    sessionStorage.setItem(SESSION_KEY, PIN);
    return true;
  }
  return false;
}

export function logout() {
  sessionStorage.removeItem(SESSION_KEY);
}
