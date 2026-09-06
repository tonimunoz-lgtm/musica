"use client";

import { useState } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  type User,
} from "firebase/auth";
import {
  doc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export type Voice = "female" | "male";
export type Profile = { name: string; notes: string; voice: Voice };

type Feedback = { text: string; ok: boolean } | null;

export default function ProfileModal({
  user,
  profile,
  onClose,
  onSaved,
}: {
  user: User;
  profile: Profile;
  onClose: () => void;
  onSaved: (p: Profile) => void;
}) {
  const [name, setName] = useState(profile.name);
  const [voice, setVoice] = useState<Voice>(profile.voice ?? "female");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [profileFeedback, setProfileFeedback] = useState<Feedback>(null);
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>(null);
  const [historyFeedback, setHistoryFeedback] = useState<Feedback>(null);

  const [busy, setBusy] = useState(false);

  async function saveProfile() {
    setBusy(true);
    setProfileFeedback(null);
    try {
      await setDoc(doc(db, "users", user.uid), { name, voice }, { merge: true });
      onSaved({ ...profile, name, voice });
      setProfileFeedback({ text: "✓ Nom i veu desats correctament.", ok: true });
    } catch (err: any) {
      setProfileFeedback({ text: err.message ?? "Error desant els canvis", ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    if (!user.email) return;
    setBusy(true);
    setPasswordFeedback(null);
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setPasswordFeedback({ text: "✓ Contrasenya canviada correctament.", ok: true });
    } catch (err: any) {
      setPasswordFeedback({
        text: err.message ?? "Error canviant la contrasenya (comprova la contrasenya actual)",
        ok: false,
      });
    } finally {
      setBusy(false);
    }
  }

  async function deleteHistory(mode: "all" | "keepLastMonth") {
    setBusy(true);
    setHistoryFeedback(null);
    try {
      const sessionsRef = collection(db, "users", user.uid, "sessions");
      let snap;
      if (mode === "all") {
        snap = await getDocs(sessionsRef);
      } else {
        const oneMonthAgo = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
        snap = await getDocs(query(sessionsRef, where("createdAt", "<", oneMonthAgo)));
      }
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));

      if (mode === "all") {
        await setDoc(doc(db, "users", user.uid), { notes: "" }, { merge: true });
        onSaved({ ...profile, name, voice, notes: "" });
      }
      setHistoryFeedback({ text: `✓ Esborrades ${snap.docs.length} converses.`, ok: true });
    } catch (err: any) {
      setHistoryFeedback({ text: err.message ?? "Error esborrant l'historial", ok: false });
    } finally {
      setBusy(false);
    }
  }

  function FeedbackLine({ feedback }: { feedback: Feedback }) {
    if (!feedback) return null;
    return (
      <p style={{ color: feedback.ok ? "#6f8f6a" : "#c96a4d", fontSize: 13, marginTop: 8, marginBottom: 0 }}>
        {feedback.text}
      </p>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1c322b",
          borderRadius: 16,
          padding: 24,
          maxWidth: 380,
          width: "100%",
          color: "#f2ede2",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 22, marginTop: 0 }}>Perfil</h2>

        <label style={{ fontSize: 13, opacity: 0.7 }}>Nom</label>
        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />

        <label style={{ fontSize: 13, opacity: 0.7, marginTop: 12, display: "block" }}>Veu de la IA</label>
        <select value={voice} onChange={(e) => setVoice(e.target.value as Voice)} style={inputStyle}>
          <option value="female">Femenina</option>
          <option value="male">Masculina</option>
        </select>

        <button type="button" disabled={busy} onClick={saveProfile} style={{ ...buttonStyle, marginTop: 12 }}>
          Desar nom i veu
        </button>
        <FeedbackLine feedback={profileFeedback} />

        <hr style={{ margin: "20px 0", borderColor: "rgba(242,237,226,0.1)" }} />

        <h3 style={{ fontSize: 15, marginBottom: 8 }}>Canviar contrasenya</h3>
        <input
          type="password"
          placeholder="Contrasenya actual"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Nova contrasenya"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          style={{ ...inputStyle, marginTop: 8 }}
        />
        <button
          type="button"
          disabled={busy || !currentPassword || !newPassword}
          onClick={changePassword}
          style={{ ...buttonStyle, marginTop: 12 }}
        >
          Canviar contrasenya
        </button>
        <FeedbackLine feedback={passwordFeedback} />

        <hr style={{ margin: "20px 0", borderColor: "rgba(242,237,226,0.1)" }} />

        <h3 style={{ fontSize: 15, marginBottom: 8 }}>Historial de converses</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (confirm("Segur que vols esborrar les converses de fa més d'un mes? No es pot desfer.")) {
                deleteHistory("keepLastMonth");
              }
            }}
            style={{ ...buttonStyle, flex: 1, background: "#1c322b", border: "1px solid rgba(242,237,226,0.2)" }}
          >
            Esborra, deixa l'últim mes
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (confirm("Segur que vols esborrar TOT l'historial i la memòria? No es pot desfer.")) {
                deleteHistory("all");
              }
            }}
            style={{ ...buttonStyle, flex: 1, background: "#c96a4d" }}
          >
            Esborra-ho tot
          </button>
        </div>
        <FeedbackLine feedback={historyFeedback} />

        <button
          type="button"
          onClick={onClose}
          style={{ ...buttonStyle, marginTop: 20, background: "transparent", border: "1px solid rgba(242,237,226,0.2)" }}
        >
          Tancar
        </button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  border: "1px solid rgba(242,237,226,0.2)",
  background: "#12211d",
  color: "#f2ede2",
  fontSize: 14,
  marginTop: 4,
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  border: "none",
  background: "#d9a441",
  color: "#12211d",
  fontWeight: 500,
  cursor: "pointer",
  fontSize: 14,
};
