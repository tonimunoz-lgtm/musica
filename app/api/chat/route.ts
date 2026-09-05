import { NextRequest, NextResponse } from "next/server";
import { getConversationReply } from "@/lib/groq";

export async function POST(req: NextRequest) {
  try {
    const { lang, history, message } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Falta el missatge" }, { status: 400 });
    }

    const result = await getConversationReply(lang ?? "it", history ?? [], message);
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Error cridant a la IA", detail },
      { status: 500 }
    );
  }
}
