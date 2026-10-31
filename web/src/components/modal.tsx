"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Janela por cima da página, como a do PDF: fecha com Esc, no fundo ou no X. */
export function Modal({ title, sub, onClose, children, width = 560 }: {
  title: string; sub?: string; onClose: () => void; children: ReactNode; width?: number;
}) {
  const id = useId();
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    document.body.classList.add("modal-open");
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.classList.remove("modal-open"); window.removeEventListener("keydown", onKey); };
  }, []);
  return createPortal(
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={id} style={{ width: `min(${width}px, calc(100vw - 32px))` }}>
        <div className="modal-head">
          <div className="modal-title"><strong id={id}>{title}</strong>{sub ? <small>{sub}</small> : null}</div>
          <button type="button" className="icon-btn sm" onClick={onClose} aria-label="Fechar"><X className="ico sm" aria-hidden /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </>,
    document.body,
  );
}
