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

function systemPrompt(langA: LangCode, langB: LangCode) {
  const a = nameOf(langA);
  const b = nameOf(langB);
  return `Ets un traductor simultani bidireccional en veu alta, no una parella de conversa. Aquesta eina s'usa per parlar amb algú que parla un idioma diferent (per exemple, un viatge): a vegades parlarà la persona que porta el mòbil, a vegades l'altra persona.

Els dos idiomes d'aquesta conversa són ${a} i ${b}.

La teva feina, per cada frase que sentis:
1. Detecta automàticament si està dita en ${a} o en ${b}.
2. Tradueix-la SEMPRE cap a l'ALTRE idioma dels dos (si l'has sentida en ${a}, digues-la en ${b}; si l'has sentida en ${b}, digues-la en ${a}).

Regles estrictes:
- NO conversis, NO responguis preguntes, NO facis comentaris ni afegeixis res de collita pròpia.
- Digues NOMÉS la traducció, en veu alta, mai la frase original.
- Si per algun motiu la frase no és clarament en cap dels dos idiomes, tradueix-la cap a ${a} per defecte.
- Si la frase és curta o ambigua, tradueix-la tal com la sentiries dir de manera natural en aquest context.`;
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
  const [langA, setLangA] = useState<LangCode>("es");
  const [langB, setLangB] = useState<LangCode>("en");
  const [pairs, setPairs] = useState<Pair[]>([]);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [pairs]);

  const { status, toggleConnection } = useLiveSession({
    systemInstruction: systemPrompt(langA, langB),
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
              Idioma 1{" "}
              <select
                value={langA}
                disabled={status !== "idle"}
                onChange={(e) => setLangA(e.target.value as LangCode)}
                style={{ background: "transparent", color: "inherit", border: "none", borderBottom: "1px solid rgba(242,237,226,0.3)" }}
              >
                {LANGS.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </label>
            <span style={{ opacity: 0.4 }}>⇄</span>
            <label style={{ fontSize: 13, opacity: 0.7 }}>
              Idioma 2{" "}
              <select
                value={langB}
                disabled={status !== "idle"}
                onChange={(e) => setLangB(e.target.value as LangCode)}
                style={{ background: "transparent", color: "inherit", border: "none", borderBottom: "1px solid rgba(242,237,226,0.3)" }}
              >
                {LANGS.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </label>
          </div>
          <p style={{ fontSize: 12, opacity: 0.5, marginTop: 6, marginBottom: 0 }}>
            Detecta sol quin dels dos idiomes parles i tradueix cap a l'altre — no cal que ho canviïs
            durant la conversa.
          </p>
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
            Tria els dos idiomes de la conversa, prem el micròfon, i parleu — tant si parles tu com
            si parla l'altra persona, es traduirà sol cap a l'idioma que toqui.
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
