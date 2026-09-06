"use client";

import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import ConversaMode from "@/components/ConversaMode";
import TraductorMode from "@/components/TraductorMode";

type Mode = "conversa" | "traductor" | null;

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    try {
      if (authMode === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "users", cred.user.uid), {
          name: name.trim(),
          notes: "",
          createdAt: serverTimestamp(),
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setAuthError(err.message ?? "Error d'autenticació");
    }
  }

  async function handleLogout() {
    await signOut(auth);
    setMode(null);
  }

  if (authLoading) {
    return <div className="app-shell" />;
  }

  if (!user) {
    return (
      <div className="app-shell" style={{ justifyContent: "center", alignItems: "center", padding: 24 }}>
        <img src="/icons/icon-192.png" alt="Chiacchiera" style={{ width: 84, height: 84, borderRadius: 20, marginBottom: 12 }} />
        <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 28, marginBottom: 8 }}>Chiacchiera</h1>
        <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 320, width: "100%" }}>
          {authMode === "signup" && (
            <input
              placeholder="El teu nom"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(242,237,226,0.2)", background: "#1c322b", color: "#f2ede2" }}
            />
          )}
          <input
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(242,237,226,0.2)", background: "#1c322b", color: "#f2ede2" }}
          />
          <input
            type="password"
            placeholder="Contrasenya"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(242,237,226,0.2)", background: "#1c322b", color: "#f2ede2" }}
          />
          {authError && <p style={{ color: "#c96a4d", fontSize: 13 }}>{authError}</p>}
          <button type="submit" className="send" style={{ width: "100%", borderRadius: 8, padding: 10 }}>
            {authMode === "signup" ? "Crear compte" : "Entrar"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setAuthMode(authMode === "signup" ? "login" : "signup")}
          style={{ marginTop: 14, background: "none", border: "none", color: "#d9a441", cursor: "pointer", fontSize: 13 }}
        >
          {authMode === "signup" ? "Ja tens compte? Entra" : "Encara no tens compte? Registra't"}
        </button>
      </div>
    );
  }

  if (mode === "conversa") return <ConversaMode user={user} onBack={() => setMode(null)} />;
  if (mode === "traductor") return <TraductorMode onBack={() => setMode(null)} />;

  return (
    <div className="app-shell" style={{ justifyContent: "center", alignItems: "center", padding: 24 }}>
      <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 24, marginBottom: 24, textAlign: "center" }}>
        Què vols fer avui?
      </h1>
      <div style={{ display: "flex", gap: 20 }}>
        <button
          type="button"
          onClick={() => setMode("conversa")}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
        >
          <img src="/icons/modes/conversa.png" alt="Conversa" style={{ width: 120, height: 120, borderRadius: 24 }} />
        </button>
        <button
          type="button"
          onClick={() => setMode("traductor")}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
        >
          <img src="/icons/modes/traductor.png" alt="Traductor" style={{ width: 120, height: 120, borderRadius: 24 }} />
        </button>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        style={{ marginTop: 28, background: "none", border: "none", color: "rgba(242,237,226,0.5)", fontSize: 13, cursor: "pointer" }}
      >
        Surt
      </button>
    </div>
  );
}
