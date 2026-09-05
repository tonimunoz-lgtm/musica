"use client";

import { useEffect, useRef, useState } from "react";

type Lang = "it" | "en";

type Message = {
  role: "user" | "ai";
  text: string;
  correction?: string | null;
};

const LANG_LABEL: Record<Lang, string> = {
  it: "italià",
  en: "anglès",
};

const VOICE_LANG: Record<Lang, string> = {
  it: "it-IT",
  en: "en-US",
};

export default function Home() {
  const [lang, setLang] = useState<Lang>("it");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const recognitionRef = useRef<any>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function speak(text: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = VOICE_LANG[lang];
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }

  function startListening() {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Aquest navegador no suporta el reconeixement de veu. Prova amb Chrome.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = VOICE_LANG[lang];
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setListening(false);
      sendMessage(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lang,
          history: messages.map((m) => ({ role: m.role, text: m.text })),
          message: trimmed,
        }),
      });
      const data = await res.json();
      const reply: string = data.reply ?? "Ho sento, no he pogut respondre ara mateix.";
      const correction: string | null = data.correction ?? null;

      setMessages((prev) => [...prev, { role: "ai", text: reply, correction }]);
      speak(reply);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: "Hi ha hagut un problema de connexió. Torna-ho a provar." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="header">
        <h1>Chiacchiera</h1>
        <p>
          Parla en {LANG_LABEL[lang]} i deixa que la conversa creixi.{" "}
          <select
            value={lang}
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
            Comença dient "bon dia" o "ciao" i mira on us porta la conversa.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i}>
            <div className={`msg ${m.role}`}>{m.text}</div>
            {m.correction && <div className="correction">✎ {m.correction}</div>}
          </div>
        ))}
        {loading && <div className="msg ai">…</div>}
      </div>

      <div className="composer">
        <button
          type="button"
          className={`mic ${listening ? "listening" : ""}`}
          onClick={listening ? stopListening : startListening}
          aria-label="Parla"
        >
          {listening ? "■" : "🎙"}
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
          placeholder={`Escriu en ${LANG_LABEL[lang]}...`}
        />
        <button
          type="button"
          className="send"
          disabled={!input.trim() || loading}
          onClick={() => sendMessage(input)}
          aria-label="Envia"
        >
          ➤
        </button>
      </div>
    </div>
  );
}
