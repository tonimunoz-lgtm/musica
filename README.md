# Chiacchiera 🌱

Practica italià o anglès amb una conversa de veu en directe (Gemini Live API): pots parlar en qualsevol moment, fins i tot interrompre la IA mentre parla, com en una conversa real.

## Estructura

```
app/
  page.tsx          → tota la lògica: WebSocket amb Gemini Live, captura i reproducció d'àudio
  layout.tsx         → metadades PWA
  globals.css
lib/
  firebase.ts         → Auth + Firestore (encara no connectat als missatges, veure "Següents passos")
public/
  manifest.json       → fa que sigui instal·lable a iPhone/Android
  icons/              → icones de l'app (substitueix-les per les definitives)
vercel.json           → força que Vercel detecti el projecte com a Next.js
```

## Posada en marxa (sense fer res en local)

1. Puja tot aquest contingut a un repositori de GitHub (arrossegant els fitxers, mantenint l'estructura de carpetes).
2. Importa el repositori a Vercel.
3. A "Environment Variables" de Vercel, afegeix (tipus **"Config"**, no "Secret", perquè comencen per `NEXT_PUBLIC_`):
   - `NEXT_PUBLIC_GEMINI_API_KEY` — clau de [aistudio.google.com/apikey](https://aistudio.google.com/apikey), sense targeta de crèdit.
   - Les 6 variables de Firebase, des de la consola de Firebase → Configuració del projecte.
4. Deploy. Obre la URL, prem el micròfon, i parla.

## Com funciona la conversa

`app/page.tsx` obre una connexió WebSocket directa des del navegador cap a la Live API de Gemini (model `gemini-2.5-flash-native-audio-preview-12-2025`, pot canviar — consulta ai.google.dev/gemini-api/docs/live-api si dona error de model). El servidor de Google detecta per si sol quan comences a parlar i talla la resposta de la IA en aquell moment, sense que calgui cap botó.

El "personatge" i les regles de correcció es defineixen dins la funció `systemPrompt()` del mateix fitxer.

**Nota de seguretat**: com que la clau és `NEXT_PUBLIC_`, queda visible en el codi que arriba al navegador. Per a ús personal entre poques persones no és un problema real, però mai la reutilitzis en un altre projecte amb dades sensibles.

## Següents passos suggerits

- Guardar cada sessió a Firestore (`users/{uid}/sessions/{id}`) perquè la conversa recordi el progrés d'un dia per l'altre.
- Si Gemini Live queda curt de límits (és capa gratuïta), es pot tornar a una arquitectura per torns amb Groq (STT+LLM) + veu del navegador — versió anterior d'aquest projecte, més senzilla però menys fluida.
