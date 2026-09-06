"use client";


import { useEffect, useState } from "react";
import buildVersion from "@/lib/buildVersion.json";

export default function UpdateBanner() {
  const [newVersionAvailable, setNewVersionAvailable] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/version.json", { cache: "no-store" });
        const data = await res.json();
        if (data.version && data.version !== buildVersion.version) {
          setNewVersionAvailable(true);
        }
      } catch {
        // si falla la comprovació, no fem res (no val la pena molestar l'usuari)
      }
    };

    check();
    const interval = setInterval(check, 60_000); // comprova cada minut
    const onFocus = () => check(); // i també quan es torna a obrir l'app
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (!newVersionAvailable) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        left: "50%",
        transform: "translateX(-50%)",
        background: "#d9a441",
        color: "#12211d",
        padding: "10px 18px",
        borderRadius: 999,
        fontSize: 14,
        fontWeight: 500,
        zIndex: 9999,
        cursor: "pointer",
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
      }}
      onClick={() => window.location.reload()}
    >
      Hi ha una versió nova · toca per actualitzar
    </div>
  );
}
