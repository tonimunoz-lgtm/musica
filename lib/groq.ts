import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Model de xat de Groq. Consulta console.groq.com per veure els models
// disponibles actualment a la capa gratuïta i canvia'l aquí si cal.
const MODEL = "llama-3.3-70b-versatile";

const LANG_NAME: Record<string, string> = {
  it: "italià",
  en: "anglès",
};

function systemPrompt(lang: string) {
  const langName = LANG_NAME[lang] ?? lang;
  return `Ets una parella de conversa amistosa que ajuda una persona catalanoparlant a practicar ${langName} parlant.

Regles:
- Respon SEMPRE en ${langName}, mai en català, excepte dins del camp "correction".
- Comença adaptant-te al nivell de la persona: frases curtes i senzilles al principi.
- Deixa que el tema flueixi de manera natural. Si la persona diu "bon dia, com estàs?", pots respondre-hi i, al cap d'un parell de torns, portar la conversa cap a un tema una mica més ric (menjar, plans, cultura, història...) sense forçar-ho.
- No siguis un professor formal: sona com un amic real, amb petites interjeccions, humor suau i naturalitat. Evita frases robòtiques o massa perfectes.
- Si la persona comet un error gramatical o de vocabulari notable, indica'l breument en català al camp "correction" (per exemple: "Es diu 'sono andato', no 'ho andato'"). Si no hi ha cap error rellevant, deixa "correction" a null. No corregeixis cada frase, només allò que realment ajudi a aprendre.
- Respon NOMÉS amb un objecte JSON vàlid, sense text abans ni després, amb aquesta forma exacta:
{"reply": "...", "correction": "..." o null}`;
}

export async function getConversationReply(
  lang: string,
  history: { role: "user" | "ai"; text: string }[],
  message: string
) {
  const messages = [
    { role: "system" as const, content: systemPrompt(lang) },
    ...history.map((m) => ({
      role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
      content: m.text,
    })),
    { role: "user" as const, content: message },
  ];

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages,
    temperature: 0.8,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";

  try {
    const parsed = JSON.parse(raw);
    return {
      reply: typeof parsed.reply === "string" ? parsed.reply : raw,
      correction: parsed.correction ?? null,
    };
  } catch {
    return { reply: raw, correction: null };
  }
}
