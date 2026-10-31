"use client";

import { CircleAlert, FileUp, Pencil, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import { CATEGORIES, DEFAULT_PORT, MAX_NAME } from "@/lib/channels/rules";
import { importChannels, saveChannel, type ImportPreview } from "./actions";

type ChannelData = { id: number; name: string; ip: string; port: number; category: string; active: boolean };

function FormError({ text }: { text?: string }) {
  return text ? <div className="form-error" role="alert"><CircleAlert className="ico sm" aria-hidden />{text}</div> : null;
}

/** Novo canal (sem channel) ou editar um do catálogo. */
export function ChannelButton({ channel, grids = [] }: { channel?: ChannelData; grids?: string[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const close = () => { setOpen(false); setError(undefined); };
  return (
    <>
      {channel
        ? <button type="button" className="icon-btn sm" onClick={() => setOpen(true)} aria-label={`Editar ${channel.name}`}><Pencil className="ico sm" aria-hidden /></button>
        : <button type="button" className="btn primary keep-sm" onClick={() => setOpen(true)}><Plus className="ico sm" aria-hidden />Novo canal</button>}
      {open ? (
        <Modal title={channel ? channel.name : "Novo canal"} sub={channel ? "Catálogo de canais" : "Fica no catálogo; depois adicione-o às grelhas"} onClose={close}>
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              start(async () => {
                const r = await saveChannel({}, form);
                if (r.error) return setError(r.error);
                toast(r.done ?? "Canal guardado", "ok");
                close();
              });
            }}
          >
            {channel ? <input type="hidden" name="id" value={channel.id} /> : null}
            <div className="field span-2">
              <label htmlFor="ch-name">Nome</label>
              <input className="input" id="ch-name" name="name" required maxLength={MAX_NAME} defaultValue={channel?.name} placeholder="Como aparece na box" autoFocus />
            </div>
            <div className="field">
              <label htmlFor="ch-ip">Endereço multicast</label>
              <input className="input mono" id="ch-ip" name="ip" required defaultValue={channel?.ip} placeholder="232.10.5.2" inputMode="decimal" pattern="\d{1,3}(\.\d{1,3}){3}" />
            </div>
            <div className="field">
              <label htmlFor="ch-port">Porta</label>
              <input className="input mono" id="ch-port" name="port" type="number" required min={1} max={65535} defaultValue={channel?.port ?? DEFAULT_PORT} />
            </div>
            <div className="field span-2">
              <label htmlFor="ch-cat">Categoria na box</label>
              <select className="select" id="ch-cat" name="category" defaultValue={channel?.category ?? "Outros"}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            {channel ? (
              <div className="span-2 switch-row">
                <span className="switch">
                  <input type="checkbox" name="active" defaultChecked={channel.active} aria-label="Canal ativo" disabled={channel.active && grids.length > 0} />
                  <span />
                </span>
                <div>
                  <strong>Ativo</strong>
                  <small>{channel.active && grids.length
                    ? <>Está em {grids.join(", ")}. Para o desativar, tire-o dessas grelhas e publique.</>
                    : "Inativo, deixa de aparecer na biblioteca do editor."}</small>
                </div>
                {channel.active && grids.length ? <input type="hidden" name="active" value="on" /> : null}
              </div>
            ) : null}
            <p className="span-2 muted form-note">
              O número do canal na TV é a posição em cada grelha. Alterações ao nome, endereço ou categoria chegam às boxes quando as grelhas que o têm forem publicadas.
            </p>
            <div className="span-2"><FormError text={error} /></div>
            <div className="span-2 btn-row end">
              <button type="button" className="btn" onClick={close}>Cancelar</button>
              <button type="submit" className={`btn primary${pending ? " busy" : ""}`} disabled={pending}>{channel ? "Guardar" : "Criar canal"}</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}

function Names({ list, max = 8 }: { list: string[]; max?: number }) {
  if (!list.length) return null;
  return <small className="import-names">{list.slice(0, max).join(", ")}{list.length > max ? ` e mais ${list.length - max}` : ""}</small>;
}

/** Importar o XML do headend (DVB ServiceDiscovery): mostra primeiro o que muda no catálogo. */
export function ImportXmlButton({ grids, gridId }: { grids: { id: number; name: string }[]; gridId: number | null }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string>();
  const [order, setOrder] = useState(false);
  const [target, setTarget] = useState(String(gridId ?? grids[0]?.id ?? ""));
  const [pending, start] = useTransition();
  const close = () => { setOpen(false); setFile(null); setPreview(null); setError(undefined); setOrder(false); };
  const run = (apply: boolean) => {
    if (!file) return setError("Escolha o ficheiro XML do headend.");
    const form = new FormData();
    form.set("file", file);
    if (apply) {
      form.set("apply", "1");
      if (order && target) form.set("grid", target);
    }
    start(async () => {
      const r = await importChannels({}, form);
      setError(r.error);
      if (r.preview) setPreview(r.preview);
      if (r.done) { toast(r.done, "ok"); close(); }
    });
  };
  const changes = preview ? preview.added.length + preview.renamed.length + preview.reactivated.length : 0;
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}><FileUp className="ico sm" aria-hidden />Importar XML</button>
      {open ? (
        <Modal title="Importar XML do headend" sub="Lista de serviços DVB (ServiceDiscovery), o mesmo ficheiro que a box aceita" onClose={close} width={620}>
          <div className="import">
            <div className="field">
              <label htmlFor="xml-file">Ficheiro</label>
              <input className="input" id="xml-file" type="file" accept=".xml,text/xml,application/xml"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setError(undefined); }} />
            </div>
            {preview ? (
              <div className="import-preview">
                <div className="kv-list">
                  <div className="kv-row"><span>Serviços no XML</span><strong>{preview.total}</strong></div>
                  <div className="kv-row"><span>Canais novos</span><strong>{preview.added.length}</strong></div>
                  {preview.added.length ? <Names list={preview.added} /> : null}
                  <div className="kv-row"><span>Com nome novo</span><strong>{preview.renamed.length}</strong></div>
                  {preview.renamed.length ? <Names list={preview.renamed.map((x) => `${x.from} → ${x.to}`)} max={6} /> : null}
                  {preview.reactivated.length ? <div className="kv-row"><span>Reativados</span><strong>{preview.reactivated.length}</strong></div> : null}
                  <div className="kv-row"><span>Iguais</span><strong>{preview.same}</strong></div>
                  <div className="kv-row"><span>No catálogo e não no XML</span><strong>{preview.missing.length}</strong></div>
                  {preview.missing.length ? <Names list={preview.missing} /> : null}
                </div>
                <p className="muted form-note">
                  Os canais identificam-se pelo endereço multicast e porta. Os novos recebem a categoria pelo nome, como na box; nada é apagado nem desativado.
                </p>
                {grids.length ? (
                  <label className="check-row">
                    <input type="checkbox" className="checkbox" checked={order} onChange={(e) => setOrder(e.target.checked)} />
                    <span>Pôr a ordem do XML (números lógicos) no rascunho de</span>
                    <select className="select" value={target} onChange={(e) => setTarget(e.target.value)} disabled={!order} aria-label="Grelha">
                      {grids.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  </label>
                ) : null}
              </div>
            ) : null}
            <FormError text={error} />
            <div className="btn-row end">
              <button type="button" className="btn" onClick={close}>Cancelar</button>
              {preview
                ? <button type="button" className={`btn primary${pending ? " busy" : ""}`} disabled={pending || (!changes && !order)} onClick={() => run(true)}>
                    {changes || order ? "Importar" : "Sem alterações"}
                  </button>
                : <button type="button" className={`btn primary${pending ? " busy" : ""}`} disabled={pending || !file} onClick={() => run(false)}>Ver alterações</button>}
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
