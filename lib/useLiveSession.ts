"use client";

import { useEffect, useRef, useState } from "react";

export type LiveStatus = "idle" | "connecting" | "listening" | "speaking";

export type VadConfig = {
  startOfSpeechSensitivity?: "START_SENSITIVITY_LOW" | "START_SENSITIVITY_HIGH";
  endOfSpeechSensitivity?: "END_SENSITIVITY_LOW" | "END_SENSITIVITY_HIGH";
  prefixPaddingMs?: number;
  silenceDurationMs?: number;
};

const DEFAULT_VAD: VadConfig = {
  startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
  endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
  prefixPaddingMs: 100,
  silenceDurationMs: 600,
};

// Model de veu en temps real de Gemini. Consulta
// ai.google.dev/gemini-api/docs/live-api si Google en publica un altre.
const MODEL_NAME = "gemini-2.5-flash-native-audio-preview-12-2025";

export function useLiveSession(params: {
  systemInstruction: string;
  voiceName: string;
  vad?: VadConfig;
  onTurn: (userText: string, aiText: string) => void;
}) {
  const [status, setStatus] = useState<LiveStatus>("idle");

  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

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

  async function startMic() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
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
      const vad = { ...DEFAULT_VAD, ...(paramsRef.current.vad ?? {}) };
      ws.send(
        JSON.stringify({
          setup: {
            model: `models/${MODEL_NAME}`,
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: paramsRef.current.voiceName } },
              },
            },
            systemInstruction: { parts: [{ text: paramsRef.current.systemInstruction }] },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            realtimeInputConfig: { automaticActivityDetection: vad },
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
        paramsRef.current.onTurn(currentUserTextRef.current.trim(), currentAiTextRef.current.trim());
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

  return { status, toggleConnection, disconnect };
}
