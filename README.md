# Xerrup 🌱

Practica italià o anglès conversant amb una IA que et corregeix i deixa que la conversa creixi de manera natural — des d'un "bon dia" fins on faci falta.

## Estructura

```
app/
  page.tsx          → interfície del xat (STT/TTS del navegador)
  layout.tsx         → metadades PWA
  api/chat/route.ts  → crida al "cervell" (Groq), amaga la clau
  globals.css
lib/
  groq.ts            → system prompt + client de Groq
  firebase.ts         → Auth + Firestore
public/
  manifest.json       → fa que sigui instal·lable a iPhone/Android
  icons/              → icones de l'app (substitueix-les per les definitives)
```

## Posada en marxa local

1. `npm install`
2. Copia `.env.example` a `.env.local` i omple les claus:
   - **Groq**: crea compte a [console.groq.com](https://console.groq.com) (sense targeta), genera una API key.
   - **Firebase**: crea un projecte a [console.firebase.google.com](https://console.firebase.google.com), activa **Authentication** i **Firestore Database** (no Realtime Database), i copia les claus web des de "Configuració del projecte".
3. `npm run dev` i obre http://localhost:3000

## Desplegament

- **GitHub**: puja aquest repositori.
- **Vercel**: importa el repositori des de vercel.com, i afegeix les mateixes variables de `.env.local` a "Environment Variables" del projecte a Vercel (aquí és on ha d'anar `GROQ_API_KEY`, no al codi).
- Un cop desplegat, obre la URL des de Safari (iPhone) o Chrome (Android) i tria "Afegir a la pantalla d'inici" — gràcies al `manifest.json` es comportarà com una app.

## Com funciona la conversa

`lib/groq.ts` conté el "prompt de sistema": les instruccions que fan que la IA parli sempre en l'idioma triat, deixi fluir el tema de manera natural, i marqui correccions puntuals en català sense trencar la immersió. Es pot ajustar aquest text per canviar el to, la dificultat inicial, o la freqüència de les correccions.

## Següents passos suggerits

- Guardar cada sessió a Firestore (`users/{uid}/sessions/{id}`) perquè la conversa recordi el progrés d'un dia per l'altre.
- Millorar la veu (TTS): ara s'usa `speechSynthesis` del navegador (gratis però una mica robòtica). Per un accent més natural, es pot substituir per ElevenLabs o Google Cloud TTS.
- Si Groq queda curt de límits, OpenRouter és una alternativa amb capa gratuïta i sense targeta, amb una migració senzilla (API compatible amb el format d'OpenAI).
