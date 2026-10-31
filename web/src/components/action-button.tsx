"use client";

import { useTransition, type ReactNode } from "react";
import type { ActionResult } from "@/lib/action";
import { toast } from "./toast";

/** Botão que corre uma ação do servidor e mostra o resultado num toast. */
export function ActionButton({ action, children, className = "btn sm", confirm, title, ariaLabel, onDone }: {
  action: () => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  confirm?: string;
  title?: string;
  ariaLabel?: string;
  onDone?: (r: ActionResult) => void;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={`${className}${pending ? " busy" : ""}`}
      disabled={pending}
      aria-busy={pending}
      title={title}
      aria-label={ariaLabel}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          const r = await action();
          if (onDone) onDone(r);
          else toast(r.message, r.ok ? "ok" : "error");
        });
      }}
    >
      {children}
    </button>
  );
}
