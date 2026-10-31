"use client";

import { CircleCheck, CircleX, Info } from "lucide-react";
import { useEffect, useState } from "react";

type Tone = "ok" | "error" | "info";
type Item = { id: number; msg: string; tone: Tone; out?: boolean };
const EVENT = "zon:toast";

export function toast(msg: string, tone: Tone = "ok") {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { msg, tone } }));
}

let seq = 0;

export function Toaster() {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const { msg, tone } = (e as CustomEvent<{ msg: string; tone: Tone }>).detail;
      const id = ++seq;
      const ms = tone === "error" ? 7000 : 3600;
      setItems((x) => [...x.slice(-3), { id, msg, tone }]);
      setTimeout(() => setItems((x) => x.map((t) => (t.id === id ? { ...t, out: true } : t))), ms);
      setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), ms + 220);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => {
        const Icon = t.tone === "error" ? CircleX : t.tone === "info" ? Info : CircleCheck;
        return (
          <div key={t.id} className={`toast ${t.tone === "error" ? "err" : ""} ${t.out ? "out" : ""}`} role={t.tone === "error" ? "alert" : "status"}>
            <Icon className="ico" aria-hidden />
            <span>{t.msg}</span>
          </div>
        );
      })}
    </div>
  );
}
