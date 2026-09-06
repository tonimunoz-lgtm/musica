"use client";


import { useEffect, useRef, useState } from "react";
import { useLiveSession } from "@/lib/useLiveSession";
import type { Voice } from "@/components/ProfileModal";

type LangCode = "ca" | "es" | "it" | "en" | "fr" | "de";

const LANGS: { code: LangCode; label: string; name: string }[] = [
  { code: "ca", label: "Català", name: "català" },
  { code: "es", label: "Castellà", name: "castellà" },
  { code: "it", label: "Italià", name: "italià" },
  { code: "en", label: "Anglès", name: "anglès" },
  { code: "fr", label: "Francès", name: "francès" },
  { code: "de", label: "Alemany", name: "alemany" },
];

function nameOf(code: LangCode) {
  return LANGS.find((l) => l.code === code)?.name ?? code;
}

function systemPrompt(inputLang: LangCode, outputLang: LangCode) {
  const from = nameOf(inputLang);
  const to = nameOf(outputLang);
  return `Ets un traductor simultani en veu alta, no una parella de conversa.

La persona parlarà en ${from}. La teva única feina és traduir TOT el que digui a ${to}, de manera natural i fluida.

Regles estrictes:
- NO conversis, NO responguis preguntes, NO facis comentaris ni afegeixis res de collita pròpia.
- Digues NOMÉS la traducció, en veu alta, en ${to}.
- Si la persona parla en un idioma diferent del ${from}, tradueix igualment el que hagi dit a ${to}.
- Si la frase és massa curta o ambigua per traduir-la sola, tradueix-la tal com la sentiries dir de manera natural en aquest context.
- No repeteixis la frase original, no la diguis en veu alta, només la traducció.`;
}

const VOICE_NAME: Record<Voice, string> = { female: "Kore", male: "Puck" };

type Pair = { original: string; translated: string };

export default function TraductorMode({
  profile,
  onOpenProfile,
  onBack,
}: {
  profile: { voice: Voice };
  onOpenProfile: () => void;
  onBack: () => void;
}) {
  const [inputLang, setInputLang] = useState<LangCode>("ca");
  const [outputLang, setOutputLang] = useState<LangCode>("it");
  const [pairs, setPairs] = useState<Pair[]>([]);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [pairs]);

  const { status, toggleConnection } = useLiveSession({
    systemInstruction: systemPrompt(inputLang, outputLang),
    voiceName: VOICE_NAME[profile.voice],
    onTurn: (userText, aiText) => {
      if (userText || aiText) {
        setPairs((prev) => [...prev, { original: userText, translated: aiText }]);
      }
    },
  });

  const statusLabel =
    status === "idle" ? "Prem per començar a traduir" :
    status === "connecting" ? "Connectant..." :
    status === "listening" ? "T'escolto..." :
    "Traduint...";

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
          <h1>Traductor</h1>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
            <label style={{ fontSize: 13, opacity: 0.7 }}>
              Parlo en{" "}
              <select
                value={inputLang}
                disabled={status !== "idle"}
                onChange={(e) => setInputLang(e.target.value as LangCode)}
                style={{ background: "transparent", color: "inherit", border: "none", borderBottom: "1px solid rgba(242,237,226,0.3)" }}
              >
                {LANGS.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </label>
            <span style={{ opacity: 0.4 }}>→</span>
            <label style={{ fontSize: 13, opacity: 0.7 }}>
              Tradueix a{" "}
              <select
                value={outputLang}
                disabled={status !== "idle"}
                onChange={(e) => setOutputLang(e.target.value as LangCode)}
                style={{ background: "transparent", color: "inherit", border: "none", borderBottom: "1px solid rgba(242,237,226,0.3)" }}
              >
                {LANGS.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenProfile}
          style={{ background: "none", border: "none", color: "rgba(242,237,226,0.5)", fontSize: 13, cursor: "pointer" }}
        >
          Perfil
        </button>
      </div>

      <div className="thread" ref={threadRef}>
        {pairs.length === 0 && (
          <p style={{ opacity: 0.5, fontSize: 14 }}>
            Tria els idiomes, prem el micròfon, i comença a parlar. Cada frase que diguis es
            traduirà en veu alta i quedarà escrita aquí a sota.
          </p>
        )}
        {pairs.map((p, i) => (
          <div key={i} style={{ marginBottom: 4 }}>
            {p.original && <div className="msg user">{p.original}</div>}
            {p.translated && <div className="msg ai" style={{ marginTop: 4 }}>{p.translated}</div>}
          </div>
        ))}
      </div>

      <div className="composer" style={{ justifyContent: "center" }}>
        <button
          type="button"
          className={`mic ${status === "listening" || status === "speaking" ? "listening" : ""}`}
          onClick={toggleConnection}
          style={{ width: 64, height: 64, fontSize: 22 }}
          aria-label={status === "idle" ? "Comença a traduir" : "Atura"}
        >
          {status === "idle" ? "🎙" : "■"}
        </button>
        <span style={{ marginLeft: 12, fontSize: 14, opacity: 0.7 }}>{statusLabel}</span>
      </div>
    </div>
  );
}
