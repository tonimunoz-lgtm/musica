"use client";

import { useEffect, useRef, useState } from "react";

type Lang = "it" | "en";

type Message = {
  role: "user" | "ai";
  text: string;
};

const LANG_LABEL: Record<Lang, string> = {
  it: "italià",
  en: "anglès",
};

// Model de veu en temps real de Gemini. Consulta
// ai.google.dev/gemini-api/docs/live-api si Google en publica un altre.
const MODEL_NAME = "gemini-2.5-flash-native-audio-preview-12-2025";

function systemPrompt(lang: Lang) {
  const langName = LANG_LABEL[lang];
  return `Ets una parella de conversa amistosa que ajuda una persona catalanoparlant a practicar ${langName} parlant en veu alta.

Regles:
- Parla SEMPRE en ${langName}, amb un accent natural, com un amic real, no com un professor formal.
- Comença amb frases curtes i senzilles, i deixa que el tema flueixi de manera natural (d'un "bon dia, com estàs?" es pot arribar a parlar d'història, cultura, plans... sense forçar-ho).
- Si la persona comet un error de gramàtica o vocabulari rellevant, interromp un moment amb una correcció MOLT breu en català (per exemple: "eh, en italià es diu així...") i després continua la conversa en ${langName}. No corregeixis cada frase, només els errors que valguin la pena.
- Sona natural: pauses, interjeccions, humor suau. Mai robòtic.`;
}

export default function Home() {
  const [lang, setLang] = useState<Lang>("it");
  const [messages, setMessages] = useState<Message[]>([]);
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
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    for (let i = 0; i < newLength; i++) {
      result[i] = buffer[Math.floor(i * ratio)];
    }
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
            responseModalities: ["AUDIO"],
            systemInstruction: { parts: [{ text: systemPrompt(lang) }] },
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

      if (sc.inputTranscription?.text) {
        currentUserTextRef.current += sc.inputTranscription.text;
      }
      if (sc.outputTranscription?.text) {
        currentAiTextRef.current += sc.outputTranscription.text;
      }

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

    ws.onerror = () => setStatus("idle");
    ws.onclose = () => setStatus("idle");
  }

  async function startMic() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStreamRef.current = stream;
    const ctx = new AudioContext();
    inputCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      const down = downsampleTo16k(input, ctx.sampleRate);
      const pcm16 = floatTo16BitPCM(down);
      const b64 = base64FromInt16(pcm16);
      wsRef.current.send(
        JSON.stringify({
          realtimeInput: { audio: { data: b64, mimeType: "audio/pcm;rate=16000" } },
        })
      );
    };

    source.connect(processor);
    processor.connect(ctx.destination);
  }

  function disconnect() {
    wsRef.current?.close();
    wsRef.current = null;
    processorRef.current?.disconnect();
    inputCtxRef.current?.close();
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    stopPlayback();
    setStatus("idle");
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

  return (
    <div className="app-shell">
      <div className="header">
        <h1>Chiacchiera</h1>
        <p>
          Conversa en directe en {LANG_LABEL[lang]}.{" "}
          <select
            value={lang}
            disabled={status !== "idle"}
            onChange={(e) => setLang(e.target.value as Lang)}
            style={{
              marginLeft: 8,
              background: "transparent",
              color: "inherit",
              border: "none",
              borderBottom: "1px solid rgba(242,237,226,0.3)",
            }}
          >
            <option value="it">Italià</option>
            <option value="en">Anglès</option>
          </select>
        </p>
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
