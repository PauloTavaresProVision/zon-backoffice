"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="notice error" role="alert">
      <span className="notice-ico"><TriangleAlert className="ico" aria-hidden /></span>
      <div className="grow">
        <strong>Não foi possível abrir esta página</strong>
        <span>{error.digest ? `Erro ${error.digest}. ` : ""}Tente de novo; se continuar, veja os registos do contentor web.</span>
      </div>
      <div className="btn-row"><button type="button" className="btn sm" onClick={reset}><RefreshCw className="ico sm" aria-hidden />Tentar de novo</button></div>
    </div>
  );
}
