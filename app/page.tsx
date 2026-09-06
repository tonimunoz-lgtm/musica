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
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import ConversaMode from "@/components/ConversaMode";
import TraductorMode from "@/components/TraductorMode";
import ProfileModal, { type Voice, type Theme } from "@/components/ProfileModal";

type Mode = "conversa" | "traductor" | null;
type Profile = { name: string; notes: string; voice: Voice; theme: Theme };

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [profile, setProfile] = useState<Profile>({ name: "", notes: "", voice: "female", theme: "aurora" });
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", profile.theme);
  }, [profile.theme]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) {
          const data = snap.data();
          setProfile({ name: data.name ?? "", notes: data.notes ?? "", voice: (data.voice as Voice) ?? "female", theme: (data.theme as Theme) ?? "aurora" });
        }
      }
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
        <img src="/icons/icon-192.png" alt="Chiacchiera" style={{ width: 84, height: 84, borderRadius: 20, marginBottom: 12, boxShadow: "var(--shadow-md)" }} />
        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 28, marginBottom: 8, color: "var(--ink)" }}>Chiacchiera</h1>
        <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 320, width: "100%" }}>
          {authMode === "signup" && (
            <input
              placeholder="El teu nom"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-tint)", color: "var(--ink)" }}
            />
          )}
          <input
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-tint)", color: "var(--ink)" }}
          />
          <input
            type="password"
            placeholder="Contrasenya"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-tint)", color: "var(--ink)" }}
          />
          {authError && <p style={{ color: "var(--warm)", fontSize: 13 }}>{authError}</p>}
          <button type="submit" className="send" style={{ width: "100%", borderRadius: 10, padding: 10 }}>
            {authMode === "signup" ? "Crear compte" : "Entrar"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setAuthMode(authMode === "signup" ? "login" : "signup")}
          style={{ marginTop: 14, background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 13, fontWeight: 500 }}
        >
          {authMode === "signup" ? "Ja tens compte? Entra" : "Encara no tens compte? Registra't"}
        </button>
      </div>
    );
  }

  const profileButton = (
    <button
      type="button"
      onClick={() => setShowProfile(true)}
      style={{ background: "none", border: "none", color: "var(--ink-soft)", fontSize: 13, cursor: "pointer" }}
    >
      Perfil
    </button>
  );

  const profileModal = showProfile && (
    <ProfileModal
      user={user}
      profile={profile}
      onClose={() => setShowProfile(false)}
      onSaved={(p) => setProfile(p)}
    />
  );

  if (mode === "conversa") {
    return (
      <>
        <ConversaMode
          user={user}
          profile={profile}
          onProfileUpdate={(p) => setProfile(p)}
          onOpenProfile={() => setShowProfile(true)}
          onBack={() => setMode(null)}
        />
        {profileModal}
      </>
    );
  }
  if (mode === "traductor") {
    return (
      <>
        <TraductorMode profile={profile} onOpenProfile={() => setShowProfile(true)} onBack={() => setMode(null)} />
        {profileModal}
      </>
    );
  }

  return (
    <div className="app-shell" style={{ justifyContent: "center", alignItems: "center", padding: 24 }}>
      <div style={{ position: "absolute", top: 16, right: 16 }}>{profileButton}</div>
      <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 24, marginBottom: 28, textAlign: "center", color: "var(--ink)" }}>
        Què vols fer avui?
      </h1>
      <div style={{ display: "flex", gap: 18 }}>
        <button type="button" className="mode-card" onClick={() => setMode("conversa")}>
          <img src="/icons/modes/conversa.png" alt="" style={{ width: 96, height: 96, borderRadius: 20 }} />
          Conversa
        </button>
        <button type="button" className="mode-card" onClick={() => setMode("traductor")}>
          <img src="/icons/modes/traductor.png" alt="" style={{ width: 96, height: 96, borderRadius: 20 }} />
          Traductor
        </button>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        style={{ marginTop: 32, background: "none", border: "none", color: "var(--ink-soft)", fontSize: 13, cursor: "pointer" }}
      >
        Surt
      </button>
      {profileModal}
    </div>
  );
}
