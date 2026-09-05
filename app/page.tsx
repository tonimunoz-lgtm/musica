"use client";

import { useEffect, useRef, useState } from "react";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type Lang = "it" | "en";
type Message = { role: "user" | "ai"; text: string };
type Profile = { name: string; notes: string };

const LANG_LABEL: Record<Lang, string> = { it: "italià", en: "anglès" };

// Model de veu en temps real de Gemini. Consulta
// ai.google.dev/gemini-api/docs/live-api si Google en publica un altre.
const MODEL_NAME = "gemini-2.5-flash-native-audio-preview-12-2025";

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
- Comença amb frases curtes i senzilles, i deixa que el tema flueixi de manera natural (d'un "bon dia, com estàs?" es pot arribar a parlar d'història, cultura, plans... sense forçar-ho).
- Si la conversa es queda sense suc, o la persona no sap què dir, pren tu la iniciativa: proposa un tema nou, fes una pregunta interessant, no esperis passivament.

Regles de correcció (importants):
- Si la persona comet un error de gramàtica o vocabulari rellevant, no ho deixis passar de llarg: interromp un moment, breument, en ${langName} si és un error petit (per exemple repetint la frase ben dita de manera natural, com faria un amic), o en català si cal explicar-ho ("eh, això es diu així...").
- Si no entens bé què ha volgut dir, o la frase no té sentit, reacciona com ho faria una persona real: pregunta’t en veu alta ("volies dir...?", "et refereixes a...?"), no facis veure que ho has entès si no és així.
- No corregeixis absolutament cada frase — només els errors que valguin la pena, per no trencar el ritme de la conversa.
- Sona natural: pauses, interjeccions, humor suau. Mai robòtic.`;
}

export default function Home() {
  // Auth
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  // Profile / memòria
  const [profile, setProfile] = useState<Profile>({ name: "", notes: "" });
  const profileRef = useRef<Profile>({ name: "", notes: "" });

  // Conversa
  const [lang, setLang] = useState<Lang>("it");
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>([]);
  const [status, setStatus] = useState<"idle" | "connecting" | "listening" | "speaking">("idle");
  const threadRef = useRef<HTMLDivElement>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const currentUserTextRef = useRef("");
  const currentAiTextRef = useRef("");

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) await loadProfile(u.uid);
    });
    return () => {
      unsub();
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfile(uid: string) {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const data = snap.data();
        setProfile({ name: data.name ?? "", notes: data.notes ?? "" });
      }
    } catch (err) {
      console.error("Error carregant el perfil:", err);
    }
  }

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
    disconnect();
    await signOut(auth);
    setMessages([]);
  }

  // --- Àudio: conversió i reproducció ---

  function floatTo16BitPCM(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
  }

  function downsampleTo16k(buffer: Float32Array, inputRate: number): Float32Array {
    if (inputRate === 16000) return buffer;
    const ratio = inputRate / 16000;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) result[i] = buffer[Math.floor(i * ratio)];
    return result;
  }

  function base64FromInt16(data: Int16Array): string {
    const bytes = new Uint8Array(data.buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function base64ToFloat32(base64: string): Float32Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;
    return float32;
  }

  function stopPlayback() {
    activeSourcesRef.current.forEach((s) => {
      try {
        s.stop();
      } catch {}
    });
    activeSourcesRef.current = [];
    if (playCtxRef.current) nextPlayTimeRef.current = playCtxRef.current.currentTime;
  }

  function playChunk(base64Audio: string) {
    if (!playCtxRef.current) {
      playCtxRef.current = new AudioContext({ sampleRate: 24000 });
      nextPlayTimeRef.current = playCtxRef.current.currentTime;
    }
    const ctx = playCtxRef.current;
    const floatData = base64ToFloat32(base64Audio);
    const buffer = ctx.createBuffer(1, floatData.length, 24000);
    buffer.copyToChannel(floatData, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const startAt = Math.max(nextPlayTimeRef.current, ctx.currentTime);
    source.start(startAt);
    nextPlayTimeRef.current = startAt + buffer.duration;
    activeSourcesRef.current.push(source);
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
    };
  }

  // --- Connexió amb Gemini Live ---

  async function connect() {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      alert("Falta la variable NEXT_PUBLIC_GEMINI_API_KEY. Afegeix-la a Vercel i fes redeploy.");
      return;
    }
    setStatus("connecting");

    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          setup: {
            model: `models/${MODEL_NAME}`,
            generationConfig: { responseModalities: ["AUDIO"] },
            systemInstruction: { parts: [{ text: systemPrompt(lang, profileRef.current) }] },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        })
      );
    };

    ws.onmessage = async (event) => {
      const data = typeof event.data === "string" ? event.data : await (event.data as Blob).text();
      const response = JSON.parse(data);

      if (response.setupComplete) {
        startMic();
        setStatus("listening");
        return;
      }

      const sc = response.serverContent;
      if (!sc) return;

      if (sc.interrupted) {
        stopPlayback();
        setStatus("listening");
      }

      if (sc.modelTurn?.parts) {
        for (const part of sc.modelTurn.parts) {
          if (part.inlineData?.data) {
            setStatus("speaking");
            playChunk(part.inlineData.data);
          }
        }
      }

      if (sc.inputTranscription?.text) currentUserTextRef.current += sc.inputTranscription.text;
      if (sc.outputTranscription?.text) currentAiTextRef.current += sc.outputTranscription.text;

      if (sc.turnComplete) {
        const userText = currentUserTextRef.current.trim();
        const aiText = currentAiTextRef.current.trim();
        setMessages((prev) => [
          ...prev,
          ...(userText ? [{ role: "user" as const, text: userText }] : []),
          ...(aiText ? [{ role: "ai" as const, text: aiText }] : []),
        ]);
        currentUserTextRef.current = "";
        currentAiTextRef.current = "";
        setStatus("listening");
      }
    };

    ws.onerror = (e) => {
      console.error("WebSocket error:", e);
      setStatus("idle");
    };
    ws.onclose = (e) => {
      console.error("WebSocket closed. Code:", e.code, "Reason:", e.reason || "(sense motiu explícit)");
      setStatus("idle");
    };
  }

  async function startMic() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStreamRef.current = stream;
    const ctx = new AudioContext();
    inputCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(1024, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      const down = downsampleTo16k(input, ctx.sampleRate);
      const pcm16 = floatTo16BitPCM(down);
      const b64 = base64FromInt16(pcm16);
      wsRef.current.send(
        JSON.stringify({ realtimeInput: { audio: { data: b64, mimeType: "audio/pcm;rate=16000" } } })
      );
    };

    source.connect(processor);
    processor.connect(ctx.destination);
  }

  async function summarizeProfile(previousNotes: string, transcript: string): Promise<string> {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) return previousNotes;

    const prompt = `Mantens una fitxa curta i útil sobre una persona que practica un idioma parlant amb una IA. La fitxa ha de recollir dades que valgui la pena recordar per a properes converses: nom, edat (si l'ha dita), interessos, feina o estudis, temes que li agraden, errors gramaticals que repeteix sovint, nivell aproximat de l'idioma, etc. Ha de ser breu (com a molt 6-8 línies), en català, en forma de notes curtes, no de prosa llarga.

Fitxa actual:
${previousNotes || "(encara no hi ha res)"}

Transcripció de la conversa d'avui:
${transcript}

Retorna NOMÉS la fitxa actualitzada (fusiona el que ja hi havia amb el que hagis après avui; si alguna dada antiga ja no té sentit, descarta-la; no repeteixis coses iguals dues vegades).`;

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
    const uid = auth.currentUser?.uid;
    const msgs = messagesRef.current;
    if (!uid || msgs.length === 0) return;

    try {
      await addDoc(collection(db, "users", uid, "sessions"), {
        lang,
        messages: msgs,
        createdAt: serverTimestamp(),
      });

      const transcript = msgs.map((m) => `${m.role === "user" ? "Ella" : "IA"}: ${m.text}`).join("\n");
      const updatedNotes = await summarizeProfile(profileRef.current.notes, transcript);

      await setDoc(
        doc(db, "users", uid),
        { notes: updatedNotes, updatedAt: serverTimestamp() },
        { merge: true }
      );
      setProfile((prev) => ({ ...prev, notes: updatedNotes }));
    } catch (err) {
      console.error("Error guardant la sessió:", err);
    }
  }

  function disconnect() {
    wsRef.current?.close();
    wsRef.current = null;
    processorRef.current?.disconnect();
    inputCtxRef.current?.close();
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    stopPlayback();
    setStatus((prev) => {
      if (prev !== "idle") saveSession();
      return "idle";
    });
  }

  function toggleConnection() {
    if (status === "idle") connect();
    else disconnect();
  }

  const statusLabel =
    status === "idle" ? "Prem per començar a parlar" :
    status === "connecting" ? "Connectant..." :
    status === "listening" ? "T'escolto..." :
    "Parlant...";

  // --- Pantalla de login/registre ---

  if (authLoading) {
    return <div className="app-shell" />;
  }

  if (!user) {
    return (
      <div className="app-shell" style={{ justifyContent: "center", alignItems: "center", padding: 24 }}>
        <img src="/icons/icon-192.png" alt="Chiacchiera" style={{ width: 84, height: 84, borderRadius: 20, marginBottom: 12 }} />
        <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 28, marginBottom: 8 }}>Chiacchiera</h1>
        <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 320 }}>
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

  // --- App principal ---

  return (
    <div className="app-shell">
      <div className="header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
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
          onClick={handleLogout}
          style={{ background: "none", border: "none", color: "rgba(242,237,226,0.5)", fontSize: 13, cursor: "pointer" }}
        >
          Surt
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
          onClick={toggleConnection}
          style={{ width: 64, height: 64, fontSize: 22 }}
          aria-label={status === "idle" ? "Comença la conversa" : "Atura la conversa"}
        >
          {status === "idle" ? "🎙" : "■"}
        </button>
        <span style={{ marginLeft: 12, fontSize: 14, opacity: 0.7 }}>{statusLabel}</span>
      </div>
    </div>
  );
}
