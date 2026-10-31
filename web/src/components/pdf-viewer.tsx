"use client";

import { Download, ExternalLink, FileText, Link2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoiceShareLink } from "@/app/(app)/clientes/actions";
import { ActionButton } from "./action-button";
import { toast } from "./toast";

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Abre o PDF da fatura numa janela por cima da página. No telemóvel oferece abrir no visualizador do sistema. */
export function PdfButton({ invoiceId, number, subtitle, variant = "button", canShare = false, cancelled = false }: {
  invoiceId: number;
  number: string;
  subtitle: string;
  variant?: "button" | "link";
  canShare?: boolean;
  cancelled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const src = `/api/faturas/${invoiceId}/pdf`;

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("modal-open");
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.classList.remove("modal-open"); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const trigger = variant === "link"
    ? <button type="button" className="link doc-link" onClick={() => setOpen(true)}>{number}</button>
    : <button type="button" className="btn xs" onClick={() => setOpen(true)} aria-label={`Abrir PDF de ${number}`}><FileText className="ico xs" aria-hidden />PDF</button>;

  return (
    <>
      {trigger}
      {open ? createPortal(
        <>
          <div className="modal-backdrop" onClick={() => setOpen(false)} />
          <div className="modal pdf" role="dialog" aria-modal="true" aria-labelledby={`pdf-${invoiceId}`}>
            <div className="modal-head">
              <div className="modal-title"><strong id={`pdf-${invoiceId}`} className="mono">{number}</strong><small>{subtitle}</small></div>
              <div className="btn-row">
                {canShare && !cancelled ? (
                  <ActionButton
                    action={invoiceShareLink.bind(null, invoiceId)}
                    onDone={async (r) => {
                      if (!r.ok || !r.value) { toast(r.message, "error"); return; }
                      if (await copy(r.value)) toast(r.message);
                      else window.prompt("Copie o link da fatura:", r.value);
                    }}
                    title="Link para o cliente abrir a fatura sem conta"
                  >
                    <Link2 className="ico sm" aria-hidden />Copiar link
                  </ActionButton>
                ) : null}
                <a className="btn sm primary" href={`${src}?download=1`}><Download className="ico sm" aria-hidden />Descarregar</a>
                <button ref={closeBtn} type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Fechar"><X className="ico" aria-hidden /></button>
              </div>
            </div>
            <div className="modal-body">
              <iframe src={src} title={`PDF ${number}`} />
              <div className="pdf-mobile">
                <FileText className="ico lg" aria-hidden />
                <p>O PDF abre no visualizador do telemóvel.</p>
                <a className="btn primary" href={src} target="_blank" rel="noopener"><ExternalLink className="ico sm" aria-hidden />Abrir PDF</a>
              </div>
            </div>
          </div>
        </>,
        document.body,
      ) : null}
    </>
  );
}
