"use client";

import { useEffect, useRef, useState } from "react";
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useLiveSession } from "@/lib/useLiveSession";
import ProfileModal, { type Voice } from "@/components/ProfileModal";
import type { User } from "firebase/auth";

type Lang = "it" | "en";
type Message = { role: "user" | "ai"; text: string };
type Profile = { name: string; notes: string; voice: Voice };

const LANG_LABEL: Record<Lang, string> = { it: "italià", en: "anglès" };
const VOICE_NAME: Record<Voice, string> = { female: "Kore", male: "Puck" };

function systemPrompt(lang: Lang, profile: Profile) {
  const langName = LANG_LABEL[lang];
  const memoryBlock = profile.name
    ? `Ja coneixes aquesta persona: es diu ${profile.name}. Coses de converses anteriors (fes-hi referència si escau, amb naturalitat, no com si llegissis una fitxa): ${
        profile.notes || "(encara no hi ha gaire historial)"
      }`
    : `Encara no saps el nom d'aquesta persona. En algun moment natural de la conversa, pregunta-li com es diu, i recorda-ho per a la resta de la conversa.`;

  return `Ets una parella de conversa amistosa que ajuda una persona catalanoparlant a practicar ${langName} parlant en veu alta. Fas també una mica de professor/a, però mai de manera formal o pesada.

${memoryBlock}

Regles de conversa:
- Parla SEMPRE en ${langName}, amb un accent natural, com un amic real, no com un professor formal.
- Comença amb frases curtes i senzilles, i deixa que el tema flueixi de manera natural.
- Si la conversa es queda sense suc, pren tu la iniciativa: proposa un tema nou, fes una pregunta interessant.

Regles de correcció:
- Si la persona comet un error rellevant, interromp un moment, breument, i corregeix-la amb naturalitat.
- Si no entens bé què ha volgut dir, reacciona com una persona real ("volies dir...?").
- No corregeixis absolutament cada frase — només els errors que valguin la pena.
- Sona natural: pauses, interjeccions, humor suau. Mai robòtic.`;
}

export default function ConversaMode({ user, onBack }: { user: User; onBack: () => void }) {
  const [lang, setLang] = useState<Lang>("it");
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>([]);
  const [profile, setProfile] = useState<Profile>({ name: "", notes: "", voice: "female" });
  const [showProfile, setShowProfile] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        const data = snap.data();
        setProfile({ name: data.name ?? "", notes: data.notes ?? "", voice: (data.voice as Voice) ?? "female" });
      }
    })();
  }, [user.uid]);

  async function summarizeProfile(previousNotes: string, transcript: string): Promise<string> {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) return previousNotes;
    const prompt = `Mantens una fitxa curta i útil sobre una persona que practica un idioma parlant amb una IA. La fitxa ha de recollir dades que valgui la pena recordar: nom, edat (si l'ha dita), interessos, feina o estudis, temes que li agraden, errors gramaticals que repeteix sovint, nivell aproximat de l'idioma, etc. Ha de ser breu (com a molt 6-8 línies), en català.

Fitxa actual:
${previousNotes || "(encara no hi ha res)"}

Transcripció de la conversa d'avui:
${transcript}

Retorna NOMÉS la fitxa actualitzada.`;
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      );
      const data = await res.json();
      const summary = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      return typeof summary === "string" && summary.trim() ? summary.trim() : previousNotes;
    } catch (err) {
      console.error("Error resumint el perfil:", err);
      return previousNotes;
    }
  }

  async function saveSession() {
    const msgs = messagesRef.current;
    if (msgs.length === 0) return;
    try {
      await addDoc(collection(db, "users", user.uid, "sessions"), {
        lang,
        messages: msgs,
        createdAt: serverTimestamp(),
      });
      const transcript = msgs.map((m) => `${m.role === "user" ? "Ella" : "IA"}: ${m.text}`).join("\n");
      const updatedNotes = await summarizeProfile(profile.notes, transcript);
      await setDoc(doc(db, "users", user.uid), { notes: updatedNotes, updatedAt: serverTimestamp() }, { merge: true });
      setProfile((prev) => ({ ...prev, notes: updatedNotes }));
    } catch (err) {
      console.error("Error guardant la sessió:", err);
    }
  }

  const { status, toggleConnection } = useLiveSession({
    systemInstruction: systemPrompt(lang, profile),
    voiceName: VOICE_NAME[profile.voice],
    onTurn: (userText, aiText) => {
      setMessages((prev) => [
        ...prev,
        ...(userText ? [{ role: "user" as const, text: userText }] : []),
        ...(aiText ? [{ role: "ai" as const, text: aiText }] : []),
      ]);
    },
  });

  function handleToggle() {
    if (status !== "idle") {
      saveSession();
      setMessages([]);
    }
    toggleConnection();
  }

  const statusLabel =
    status === "idle" ? "Prem per començar a parlar" :
    status === "connecting" ? "Connectant..." :
    status === "listening" ? "T'escolto..." :
    "Parlant...";

  return (
    <div className="app-shell">
      <div className="header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <button
            type="button"
            onClick={onBack}
            style={{ background: "none", border: "none", color: "rgba(242,237,226,0.5)", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 6 }}
          >
            ‹ Modes
          </button>
          <h1>Chiacchiera</h1>
          <p>
            Conversa en directe en {LANG_LABEL[lang]}.{" "}
            <select
              value={lang}
              disabled={status !== "idle"}
              onChange={(e) => setLang(e.target.value as Lang)}
              style={{ marginLeft: 8, background: "transparent", color: "inherit", border: "none", borderBottom: "1px solid rgba(242,237,226,0.3)" }}
            >
              <option value="it">Italià</option>
              <option value="en">Anglès</option>
            </select>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowProfile(true)}
          style={{ background: "none", border: "none", color: "rgba(242,237,226,0.5)", fontSize: 13, cursor: "pointer" }}
        >
          Perfil
        </button>
      </div>

      <div className="thread" ref={threadRef}>
        {messages.length === 0 && (
          <p style={{ opacity: 0.5, fontSize: 14 }}>
            Prem el micròfon i comença dient "bon dia" o "ciao". Pots parlar per sobre seu en
            qualsevol moment, com en una conversa real.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.text}
          </div>
        ))}
      </div>

      <div className="composer" style={{ justifyContent: "center" }}>
        <button
          type="button"
          className={`mic ${status === "listening" || status === "speaking" ? "listening" : ""}`}
          onClick={handleToggle}
          style={{ width: 64, height: 64, fontSize: 22 }}
          aria-label={status === "idle" ? "Comença la conversa" : "Atura la conversa"}
        >
          {status === "idle" ? "🎙" : "■"}
        </button>
        <span style={{ marginLeft: 12, fontSize: 14, opacity: 0.7 }}>{statusLabel}</span>
      </div>

      {showProfile && (
        <ProfileModal
          user={user}
          profile={profile}
          onClose={() => setShowProfile(false)}
          onSaved={(p) => setProfile(p)}
        />
      )}
    </div>
  );
}
