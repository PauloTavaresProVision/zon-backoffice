/* Zon Backoffice — mockup navegável. Sem backend: todas as ações são simuladas. */
(function () {
  "use strict";

  const DATA = window.ZON_DATA;
  const CH = window.ZON_CHANNELS || [];
  const TODAY = new Date(DATA.TODAY + "T00:00:00");

  /* ---------------- helpers ---------------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const NB = " ";
  const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const int = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NB);
  const kz = (n) => int(n) + NB + "Kz";
  const dec = (n, d = 1) => n.toFixed(d).replace(".", ",");
  const mkz = (n) => dec(n) + NB + "M" + NB + "Kz";
  const pct = (n, d = 1) => dec(n, d) + "%";
  const pad = (n) => String(n).padStart(2, "0");
  const D = (s) => new Date(s + "T00:00:00");
  const date = (s) => { const d = D(s); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
  const days = (s) => Math.round((D(s) - TODAY) / 86400000);
  const rel = (s) => {
    const n = days(s);
    if (n === 0) return "hoje";
    if (n === 1) return "amanhã";
    if (n === -1) return "ontem";
    return n > 0 ? `em ${n} dias` : `há ${-n} dias`;
  };
  const refFmt = (r) => r.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
  const initials = (name) => { const p = name.split(/\s+/).filter(Boolean); return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); };
  const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const icon = (name, cls = "") => `<i data-lucide="${name}" class="ico ${cls}"></i>`;
  const refreshIcons = () => { if (window.lucide) window.lucide.createIcons(); };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* armazenamento indisponível */ } },
  };

  const planById = (id) => DATA.plans.find((p) => p.id === id);
  const gridById = (id) => DATA.grids.find((g) => g.id === id);
  const clientById = (id) => DATA.clients.find((c) => c.id === +id);
  const shortPlan = (p) => p.name.replace(/^ZON\s/, "");
  const chByN = (n) => CH.find((c) => c.n === n);

  const CAT_ICON = {
    "Angola": "flag", "Notícias": "newspaper", "Entretenimento": "sparkles", "Filmes e séries": "clapperboard",
    "Desporto": "trophy", "Infantil": "baby", "Documentários": "telescope", "Música": "music", "Rádio": "radio",
  };
  const CAT_DESC = {
    "Angola": "Canais nacionais e regionais", "Notícias": "Informação nacional e internacional", "Entretenimento": "Generalistas, variedades e estilo de vida",
    "Filmes e séries": "Cinema, séries e novelas", "Desporto": "Futebol, motores, combate e mais", "Infantil": "Desenhos animados e pré-escolar",
    "Documentários": "Natureza, história e ciência", "Música": "Videoclipes e concertos", "Rádio": "Estações de rádio na box",
  };
  const CATS = Object.keys(CAT_ICON);
  const GRID_PACKS = { ess: planById("f50e").packs, tot: planById("f50t").packs, pre: planById("f100p").packs };
  const gridChannels = (gid) => CH.filter((c) => GRID_PACKS[gid].includes(c.cat));
  DATA.plans.forEach((p) => { p.channels = p.grid ? gridChannels(p.grid).length : 0; });

  const LOGO = `<svg class="zon-logo" viewBox="0 0 366 142" role="img" aria-label="ZON"><path class="gold" d="M27,51 L106,51 L106,28 L52,28 Q28,28 27,51 M27,102 L78,51 L106,51 L106,68 L72,102 L105,102 L105,126 L27,126 Z M222,28 L247,28 L301,85 L301,57 L325,57 L325,125 L301,125 L247,70 L247,125 L222,125 Z"/><path class="ring" fill-rule="evenodd" d="M162,27 C231,27 232,127 164,127 C96,127 96,27 162,27 M163,47 C123,47 124,107 164,107 C204,107 203,47 163,47"/><path class="shade" d="M113,59 L133,60 C117,86 135,108 151,112 L142,125 C115,117 102,89 113,59"/><path class="gold" d="M302,37h8v8h-8z M316,32h8v13h-8z M309,49h8v8h-8z M297,27h5v6h-5z M108,104h6v6h-6z M115,112h7v7h-7z M107,120h6v6h-6z M99,115h5v5h-5z"/><path class="dots" d="M126,28h4v4h-4z M135,33h5v5h-5z M121,36h4v4h-4z M130,41h4v4h-4z M140,26h5v5h-5z"/></svg>`;

  /* ---------------- status vocab ---------------- */
  function clientState(c) {
    if (c.status === "inactive") return { key: "inactive", label: "Inativo", tone: "", icon: "circle-pause" };
    if (c.status === "late") return { key: "late", label: "Em atraso", tone: "serious", icon: "circle-alert" };
    if (days(c.due) <= 7) return { key: "expiring", label: "A expirar", tone: "warning", icon: "clock" };
    return { key: "active", label: "Ativo", tone: "good", icon: "circle-check" };
  }
  const BOX_STATE = {
    online: { label: "Online", tone: "good", icon: "wifi" },
    offline: { label: "Offline", tone: "", icon: "wifi-off" },
    blocked: { label: "Bloqueada", tone: "critical", icon: "lock" },
    pending: { label: "Por aprovar", tone: "warning", icon: "key-round" },
  };
  const PAY_STATE = {
    paid: { label: "Paga", tone: "good", icon: "circle-check" },
    pending: { label: "Pendente", tone: "warning", icon: "clock" },
    expired: { label: "Expirada", tone: "critical", icon: "circle-x" },
  };
  const pill = (s) => `<span class="pill ${s.tone}">${icon(s.icon)}${esc(s.label)}</span>`;

  function logoTile(ch, cls = "") {
    if (!ch) return "";
    const lt = ch.light ? " light" : "";
    if (ch.logo) return `<span class="logo-tile${lt} ${cls}" title="${esc(ch.name)}"><img src="${ch.logo}" alt="${esc(ch.name)}" loading="lazy"></span>`;
    const ini = ch.name.replace(/\(.*?\)/g, "").replace(/\bHD\b/g, "").trim().split(/\s+/).slice(0, 2).join(" ");
    return `<span class="logo-tile ${cls}" title="${esc(ch.name)}"><span class="ini">${esc(ini)}</span></span>`;
  }

  /* ---------------- state ---------------- */
  const state = {
    clientFilter: "all", clientQuery: "", clientPlan: "all", selected: new Set(),
    payFilter: "all", boxFilter: "all", approved: 0,
    pending: DATA.pendingBoxes.slice(),
    canaisTab: "grelhas", gridId: "tot", lineup: null, draftVersion: 13, draftChanges: 4,
    libQuery: "", catQuery: "", catCat: "all", catPage: 1,
    chartTable: false, dailyTable: false,
    smsTemplate: "ZON: Olá {nome}, a sua mensalidade de {valor} vence a {validade}. Pague no Multicaixa: Entidade {entidade}, Referência {referencia}. Obrigado!",
  };
  const pendingCount = () => DATA.kpis.boxes.pending - state.approved;
  let charts = [];
  let current = null;

  /* ---------------- shell ---------------- */
  const NAV = [
    { group: "Geral", items: [{ id: "dashboard", label: "Dashboard", icon: "layout-dashboard" }] },
    { group: "Clientes", items: [
      { id: "clientes", label: "Clientes", icon: "users", count: () => int(DATA.kpis.total) },
      { id: "boxes", label: "Boxes", icon: "tv", count: () => String(pendingCount()), alert: true },
    ] },
    { group: "Serviço", items: [
      { id: "planos", label: "Planos", icon: "layers" },
      { id: "canais", label: "Canais & grelhas", icon: "list-video" },
    ] },
    { group: "Financeiro", items: [{ id: "pagamentos", label: "Pagamentos", icon: "receipt" }] },
    { group: "Sistema", items: [
      { id: "utilizadores", label: "Utilizadores", icon: "user-cog" },
      { id: "definicoes", label: "Definições", icon: "settings" },
    ] },
  ];
  const SYS_SHORT = { "IXC Zon": "há 4 min", "AppyPay": "98 ms", "WeSender": "1 820 SMS", "TvBox API": "3 902 online" };

  function mountShell() {
    if ($("#view")) return;
    const warn = DATA.integrations.filter((i) => i.state !== "ok").length;
    $("#root").innerHTML = `
    <div class="app">
      <aside class="sidebar" aria-label="Navegação principal">
        <a class="brand" href="#/dashboard" aria-label="Zon Backoffice — início">${LOGO}<span class="brand-tag">Backoffice</span></a>
        <nav>
          ${NAV.map((g) => `<div class="nav-group"><div class="nav-caption">${g.group}</div>${g.items.map((it) => `
            <a class="nav-item" href="#/${it.id}" data-nav="${it.id}" title="${it.label}">${icon(it.icon)}<span class="label">${it.label}</span>${it.count ? `<span class="nav-count ${it.alert ? "alert" : ""}" data-count="${it.id}">${it.count()}</span>` : ""}</a>`).join("")}</div>`).join("")}
        </nav>
        <div class="sidebar-foot">
          <div class="sys-status">
            <div class="sys-status-head"><span>Sistemas</span>${warn ? `<span class="pill warning" style="height:20px;font-size:11px">${icon("triangle-alert")}${warn} aviso</span>` : `<span class="pill good" style="height:20px;font-size:11px">${icon("circle-check")}OK</span>`}</div>
            ${DATA.integrations.slice(0, 4).map((i) => `<div class="sys-row"><span class="dot ${i.state === "warn" ? "warn" : ""}"></span><span>${i.name}</span><span>${SYS_SHORT[i.name] || ""}</span></div>`).join("")}
          </div>
          <div class="me">
            <span class="avatar gold">PT</span>
            <div class="me-meta"><strong>Paulo Tavares</strong><small>Administrador</small></div>
            <a class="icon-btn sm" href="#/entrar" title="Terminar sessão" aria-label="Terminar sessão">${icon("log-out", "sm")}</a>
          </div>
        </div>
      </aside>
      <div class="main">
        <header class="topbar" id="topbar">
          <a class="topbar-logo" href="#/dashboard" aria-label="Início">${LOGO}</a>
          <div class="crumbs" id="crumbs"></div>
          <div class="spacer mobile-only"></div>
          <div class="search" id="search">
            ${icon("search", "sm")}
            <input id="q" type="search" placeholder="Procurar cliente, serial da box ou referência…" autocomplete="off" aria-label="Pesquisa global">
            <span class="kbd">Ctrl K</span>
            <div class="search-results" id="sr" hidden></div>
          </div>
          <button class="icon-btn mobile-only" data-action="open-search" aria-label="Pesquisar">${icon("search")}</button>
          <button class="icon-btn desktop-only" data-action="theme" aria-label="Mudar entre tema claro e escuro" title="Tema claro/escuro">${icon("sun-moon")}</button>
          <button class="icon-btn" data-action="toast" data-arg="3 notificações novas: 30 chaves por aprovar, saldo de SMS baixo, grelha em rascunho" aria-label="Notificações">${icon("bell")}<span class="badge-dot"></span></button>
          <a class="avatar gold mobile-only" href="#/utilizadores" aria-label="O meu perfil">PT</a>
        </header>
        <main class="content" id="view" tabindex="-1"></main>
      </div>
    </div>
    <nav class="tabbar" aria-label="Navegação rápida">
      <a href="#/dashboard" data-tab="dashboard">${icon("layout-dashboard")}<span>Início</span></a>
      <a href="#/clientes" data-tab="clientes">${icon("users")}<span>Clientes</span></a>
      <a href="#/boxes" data-tab="boxes">${icon("tv")}<span>Boxes</span><span class="badge" data-count="boxes-tab">${pendingCount()}</span></a>
      <a href="#/pagamentos" data-tab="pagamentos">${icon("receipt")}<span>Pagamentos</span></a>
      <button data-action="open-sheet" data-more>${icon("menu")}<span>Mais</span></button>
    </nav>
    <button class="fab" id="fab" data-action="fab"></button>
    <div class="sheet-backdrop" data-action="close-sheet"></div>
    <div class="sheet" role="dialog" aria-label="Mais opções">
      <div class="sheet-grip"></div>
      <div class="sheet-grid">
        <a href="#/planos">${icon("layers", "lg")}Planos</a>
        <a href="#/canais">${icon("list-video", "lg")}Canais & grelhas</a>
        <a href="#/utilizadores">${icon("user-cog", "lg")}Utilizadores</a>
        <a href="#/definicoes">${icon("settings", "lg")}Definições</a>
        <button data-action="theme">${icon("sun-moon", "lg")}Tema</button>
        <a href="#/entrar">${icon("log-out", "lg")}Sair</a>
      </div>
    </div>
    <div class="tooltip" id="tt" role="status"></div>
    <div class="toasts" id="toasts" aria-live="polite"></div>`;
    bindSearch();
  }

  function updateCounts() {
    $$("[data-count='boxes']").forEach((el) => { el.textContent = pendingCount(); });
    $$("[data-count='boxes-tab']").forEach((el) => { el.textContent = pendingCount(); });
  }

  function setFab(fab) {
    const el = $("#fab");
    if (!el) return;
    if (!fab) { el.classList.remove("show"); return; }
    el.innerHTML = `${icon(fab.icon)}${esc(fab.label)}`;
    el.dataset.arg = fab.toast;
    el.classList.add("show");
  }

  function toast(msg, ico = "circle-check") {
    const box = $("#toasts");
    if (!box) return;
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = `${icon(ico)}<span>${esc(msg)}</span>`;
    box.appendChild(t);
    refreshIcons();
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 220); }, 3200);
  }

  /* ---------------- router ---------------- */
  const ROUTES = {
    dashboard: viewDashboard, clientes: viewClientes, boxes: viewBoxes, planos: viewPlanos,
    canais: viewCanais, pagamentos: viewPagamentos, utilizadores: viewUtilizadores, definicoes: viewDefinicoes,
  };

  function route(scrollTop = true) {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
    const name = (ROUTES[parts[0]] || parts[0] === "entrar") ? parts[0] : "dashboard";
    document.body.classList.remove("sheet-open");
    if (name === "entrar") { viewLogin(); return; }
    mountShell();
    hideResults();
    const def = ROUTES[name](parts.slice(1));
    current = { name, def };
    const view = $("#view");
    view.innerHTML = def.html;
    $("#crumbs").innerHTML = def.crumbs.map((c, i, a) => (i === a.length - 1 ? `<strong>${esc(c)}</strong>` : `<span>${esc(c)}</span>${icon("chevron-right", "xs")}`)).join("");
    $$("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === name));
    $$("[data-tab]").forEach((a) => a.classList.toggle("on", a.dataset.tab === name));
    const more = $("[data-more]");
    if (more) more.classList.toggle("on", ["planos", "canais", "utilizadores", "definicoes"].includes(name));
    setFab(def.fab);
    charts = [];
    if (def.mount) def.mount(view);
    refreshIcons();
    document.title = `${def.crumbs[def.crumbs.length - 1]} · Zon Backoffice`;
    if (scrollTop) window.scrollTo(0, 0);
  }
  const rerender = () => route(false);

  /* ---------------- charts ---------------- */
  function barPath(x, y, w, h, color) {
    if (h <= 0.5) return "";
    const r = Math.min(4, w / 2, h);
    return `<path d="M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z" style="fill:${color}"/>`;
  }

  function bindTooltip(root, html) {
    const tt = $("#tt");
    const show = (e) => {
      const t = e.target.closest && e.target.closest("[data-i]");
      if (!t || !root.contains(t)) { tt.classList.remove("show"); return; }
      tt.innerHTML = html(+t.dataset.i);
      const r = tt.getBoundingClientRect();
      let x = e.clientX + 14;
      let y = e.clientY + 14;
      if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
      if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
      tt.style.left = Math.max(8, x) + "px";
      tt.style.top = Math.max(8, y) + "px";
      tt.classList.add("show");
    };
    root.addEventListener("pointermove", show);
    root.addEventListener("pointerdown", show);
    root.addEventListener("pointerleave", () => tt.classList.remove("show"));
  }

  function columnChart(el, o) {
    const W = Math.max(280, el.clientWidth);
    const H = o.height || 240;
    const p = { l: 40, r: 6, t: 14, b: 28 };
    const iw = W - p.l - p.r;
    const ih = H - p.t - p.b;
    const n = o.labels.length;
    const band = iw / n;
    const bw = Math.min(24, band * (o.fill || 0.56));
    const y = (v) => p.t + ih - (v / o.max) * ih;
    let s = `<svg width="${W}" height="${H}" role="img" aria-label="${esc(o.aria)}">`;
    o.ticks.forEach((t) => {
      s += `<line class="${t === 0 ? "base-line" : "grid-line"}" x1="${p.l}" x2="${W - p.r}" y1="${y(t)}" y2="${y(t)}"/>`;
      s += `<text x="${p.l - 8}" y="${y(t) + 4}" text-anchor="end">${t === 0 ? "0" : o.tickFmt(t)}</text>`;
    });
    o.labels.forEach((lab, i) => {
      const cx = p.l + band * i + band / 2;
      const x = cx - bw / 2;
      if (o.ghost) s += barPath(x, y(o.ghost[i]), bw, y(0) - y(o.ghost[i]), "var(--series-ghost)");
      s += barPath(x, y(o.values[i]), bw, y(0) - y(o.values[i]), "var(--series-1)");
      if (!o.labelEvery || i % o.labelEvery === 0 || i === n - 1) s += `<text x="${cx}" y="${H - p.b + 18}" text-anchor="middle">${lab}</text>`;
    });
    if (o.mark != null) {
      const i = o.mark;
      const cx = p.l + band * i + band / 2;
      // Junto às margens o rótulo alinha pela barra para não tocar no eixo nem sair do gráfico
      const edge = i < n * 0.15 ? "start" : i > n * 0.85 ? "end" : "middle";
      const tx = edge === "start" ? cx - bw / 2 : edge === "end" ? cx + bw / 2 : cx;
      s += `<text class="val" x="${tx}" y="${y(o.values[i]) - 7}" text-anchor="${edge}">${o.markFmt(o.values[i])}</text>`;
    }
    o.labels.forEach((_, i) => { s += `<rect class="hit" data-i="${i}" x="${p.l + band * i}" y="${p.t}" width="${band}" height="${ih}" rx="6"/>`; });
    s += "</svg>";
    el.innerHTML = s;
  }

  function spark(values) {
    const w = 84, h = 28;
    const min = Math.min(...values), max = Math.max(...values);
    const pts = values.map((v, i) => [i * (w / (values.length - 1)), h - 4 - ((v - min) / (max - min || 1)) * (h - 8)]);
    const d = pts.map((pt, i) => `${i ? "L" : "M"}${pt[0].toFixed(1)},${pt[1].toFixed(1)}`).join(" ");
    const last = pts[pts.length - 1];
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" style="stroke:var(--muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="4" style="fill:var(--series-1);stroke:var(--surface)" stroke-width="2"/></svg>`;
  }

  function stackBar(parts, label) {
    const total = parts.reduce((a, b) => a + b.value, 0);
    return `<div class="meter-track" role="img" aria-label="${esc(label)}">${parts.map((x) => `<span style="width:${(x.value / total) * 100}%;background:${x.color}"></span>`).join("")}</div>
      <div class="meter-legend">${parts.map((x) => `<span><i class="swatch" style="background:${x.color}"></i>${esc(x.label)} <b>${int(x.value)}</b></span>`).join("")}</div>`;
  }

  /* ================================================================
     DASHBOARD
     ================================================================ */
  function viewDashboard() {
    const k = DATA.kpis, r = DATA.refsMonth, m = DATA.monthly;
    const delta = (m.received[11] / m.received[10] - 1) * 100;
    const rate = (r.paid / r.issued) * 100;
    const expiring = DATA.clients.filter((c) => c.status === "active" && days(c.due) >= 0 && days(c.due) <= 7).sort((a, b) => days(a.due) - days(b.due));
    const maxPlan = Math.max(...DATA.plans.map((p) => p.clients));
    const b = k.boxes;

    const html = `
    <section class="hello">
      <div><p class="eyebrow">Sábado, 31 de outubro de 2026</p><h1>Bom dia, Paulo</h1></div>
      <div class="btn-row">
        <div class="seg" role="group" aria-label="Período">${["Hoje", "7 dias", "Este mês", "12 meses"].map((x, i) => `<button class="${i === 2 ? "on" : ""}" data-action="seg">${x}</button>`).join("")}</div>
        <button class="btn" data-action="toast" data-arg="Relatório de outubro exportado (PDF)">${icon("download", "sm")}Exportar</button>
      </div>
    </section>

    <section class="kpi-grid">
      <article class="card hero">
        <div class="hero-label"><span>Recebido em outubro</span><span class="pill good">${icon("trending-up")}+${dec(delta)}% vs setembro</span></div>
        <div class="hero-num">${dec(r.paidKz)}<span>M Kz</span></div>
        <p class="hero-sub">de <b>${mkz(r.issuedKz)}</b> emitidos em ${int(r.issued)} referências · taxa de cobrança <b>${pct(rate)}</b></p>
        <div class="meter">
          ${stackBar([
            { label: "Pagas", value: r.paid, color: "var(--good)" },
            { label: "Pendentes", value: r.pending, color: "var(--warning)" },
            { label: "Expiradas", value: r.expired, color: "var(--critical)" },
          ], "Estado das referências de outubro")}
        </div>
      </article>
      ${kpiTile("Clientes ativos", "users", int(k.active), `<span class="delta up">${icon("arrow-up-right", "xs")}+38</span> este mês`, spark(k.activeSpark), "#/clientes", "active")}
      ${kpiTile("Clientes inativos", "user-x", int(k.inactive), `<span class="delta up">${icon("arrow-down-right", "xs")}−12</span> este mês`, spark(k.inactiveSpark), "#/clientes", "inactive")}
      ${kpiTile("Boxes online", "tv", `${int(b.online)}<small>/ ${int(b.total)}</small>`, `${pct((b.online / b.total) * 100)} da base · ${int(b.offline)} offline`, "", "#/boxes")}
      ${kpiTile("A expirar em 7 dias", "clock", int(k.expiring), `<button class="link" data-action="toast" data-arg="214 lembretes por SMS agendados para as 08:00">Enviar lembretes ${icon("arrow-right", "xs")}</button>`, "", null, null, true)}
    </section>

    <section class="row-2">
      <article class="card">
        <div class="card-head">
          <div><h2>Emitido vs recebido</h2><p class="sub">Referências Multicaixa · últimos 12 meses</p></div>
          <div class="legend"><span><i class="swatch" style="background:var(--series-1)"></i>Recebido</span><span><i class="swatch" style="background:var(--series-ghost);box-shadow:inset 0 0 0 1px var(--line-strong)"></i>Emitido</span></div>
        </div>
        <div class="card-body">
          <div class="chart" id="chart-rev"></div>
          <div id="rev-table" class="chart-table" ${state.chartTable ? "" : "hidden"}>${revenueTable()}</div>
        </div>
        <div class="card-foot"><span>Valores em milhões de Kwanzas</span><button class="link" data-action="toggle-table" data-arg="chartTable">${icon("table-2", "xs")}<span>${state.chartTable ? "Esconder tabela" : "Ver tabela"}</span></button></div>
      </article>

      <article class="card">
        <div class="card-head"><div><h2>A expirar esta semana</h2><p class="sub">${int(k.expiring)} contratos nos próximos 7 dias</p></div></div>
        <div class="list mt">
          ${expiring.slice(0, 6).map((c) => `
            <div class="list-item">
              <span class="avatar">${initials(c.name)}</span>
              <a class="grow" href="#/clientes/${c.id}"><strong>${esc(c.name)}</strong><small>${esc(shortPlan(planById(c.plan)))} · ${kz(planById(c.plan).price)}</small></a>
              <span class="pill warning">${icon("clock")}${rel(c.due)}</span>
              <button class="icon-btn sm bordered" data-action="toast" data-arg="SMS com a referência enviado para ${esc(c.name)}" aria-label="Enviar SMS a ${esc(c.name)}" title="Enviar SMS">${icon("message-square", "sm")}</button>
            </div>`).join("")}
        </div>
        <div class="card-foot"><span>Lembretes automáticos D-7, D-3 e D-1</span><button class="link" data-action="clients-filter" data-arg="expiring">Ver todos ${icon("arrow-right", "xs")}</button></div>
      </article>
    </section>

    <section class="row-3">
      <article class="card">
        <div class="card-head"><div><h2>Clientes por plano</h2><p class="sub">${int(k.active)} clientes ativos</p></div><a class="link" href="#/planos">Planos ${icon("arrow-right", "xs")}</a></div>
        <div class="card-body">
          <div class="hbar-list">
            ${DATA.plans.slice().sort((a, b2) => b2.clients - a.clients).map((p) => `
              <div class="hbar-row">
                <span class="name">${esc(shortPlan(p))}</span>
                <span class="val"><b>${int(p.clients)}</b> · ${pct((p.clients / k.active) * 100, 0)}</span>
                <div class="hbar-track"><span style="width:${(p.clients / maxPlan) * 100}%"></span></div>
              </div>`).join("")}
          </div>
        </div>
      </article>

      <article class="card">
        <div class="card-head"><div><h2>Estado das boxes</h2><p class="sub">${int(b.total)} registadas</p></div><a class="link" href="#/boxes">Boxes ${icon("arrow-right", "xs")}</a></div>
        <div class="card-body">
          ${stackBar([
            { label: "Online", value: b.online, color: "var(--good)" },
            { label: "Offline", value: b.offline, color: "var(--muted)" },
            { label: "Bloqueadas", value: b.blocked, color: "var(--critical)" },
            { label: "Por aprovar", value: pendingCount(), color: "var(--warning)" },
          ], "Estado das boxes")}
          <div class="kv-list mt">
            <div class="kv-row"><span>App 0.8.0 (atual)</span><strong>4 051 boxes</strong></div>
            <div class="kv-row"><span>App 0.7.2</span><strong>359 boxes</strong></div>
            <div class="kv-row"><span>Grelha TV Total</span><strong><span class="pill gold">${icon("pencil")}Rascunho v13</span></strong></div>
          </div>
        </div>
        <div class="card-foot"><span>${pendingCount()} chaves de instalação por aprovar</span><a class="link" href="#/boxes">Aprovar ${icon("arrow-right", "xs")}</a></div>
      </article>

      <article class="card">
        <div class="card-head"><div><h2>Atividade recente</h2><p class="sub">Todas as integrações</p></div></div>
        <div class="feed">
          ${DATA.activity.map((a) => `<div class="feed-item"><span class="feed-ico ${a.tone}">${icon(a.icon)}</span><div><p>${a.html}</p><time>${esc(a.time)}</time></div></div>`).join("")}
        </div>
      </article>
    </section>

    <article class="card mt">
      <div class="card-head"><div><h2>Integrações</h2><p class="sub">Um único backoffice ligado a todos os sistemas</p></div><a class="link" href="#/definicoes">Configurar ${icon("arrow-right", "xs")}</a></div>
      <div class="integrations mt">
        ${DATA.integrations.map((i) => `
          <div class="integration">
            <div class="integration-head"><span class="dot ${i.state === "warn" ? "warn" : ""}"></span>${esc(i.name)}</div>
            <small>${esc(i.desc)}</small>
            <small class="text-2">${esc(i.meta)}</small>
          </div>`).join("")}
      </div>
    </article>`;

    return {
      crumbs: ["Dashboard"],
      html,
      mount(view) {
        const el = $("#chart-rev", view);
        const draw = () => columnChart(el, {
          labels: m.labels, values: m.received, ghost: m.issued, max: 60, ticks: [0, 20, 40, 60],
          tickFmt: (t) => `${t} M`, aria: "Emitido e recebido por mês nos últimos 12 meses", height: 250,
        });
        draw();
        charts.push(draw);
        bindTooltip(el, (i) => `<div class="tt-title">${m.labels[i]} ${m.years[i]}</div>
          <div class="tt-row"><span><i class="swatch" style="background:var(--series-1)"></i>Recebido</span><b>${mkz(m.received[i])}</b></div>
          <div class="tt-row"><span><i class="swatch" style="background:var(--series-ghost);box-shadow:inset 0 0 0 1px var(--line-strong)"></i>Emitido</span><b>${mkz(m.issued[i])}</b></div>
          <div class="tt-row"><span>Taxa de cobrança</span><b>${pct((m.received[i] / m.issued[i]) * 100)}</b></div>`);
      },
    };
  }

  function kpiTile(label, ico, value, foot, sparkSvg, href, filter, attention) {
    const tag = href ? "a" : "article";
    const attrs = href ? `href="${href}" ${filter ? `data-action="clients-filter" data-arg="${filter}"` : ""}` : "";
    return `<${tag} class="card kpi ${attention ? "attention" : ""}" ${attrs}>
      <div class="kpi-top"><span class="kpi-label">${esc(label)}</span><span class="kpi-icon">${icon(ico, "sm")}</span></div>
      <div class="kpi-value">${value}</div>
      <div class="kpi-foot"><span>${foot}</span>${sparkSvg}</div>
    </${tag}>`;
  }

  function revenueTable() {
    const m = DATA.monthly;
    return `<div class="table-wrap"><table class="data"><thead><tr><th>Mês</th><th class="num">Emitido</th><th class="num">Recebido</th><th class="num">Taxa</th></tr></thead><tbody>
      ${m.labels.map((l, i) => `<tr><td>${l} ${m.years[i]}</td><td class="num">${mkz(m.issued[i])}</td><td class="num">${mkz(m.received[i])}</td><td class="num">${pct((m.received[i] / m.issued[i]) * 100)}</td></tr>`).join("")}
    </tbody></table></div>`;
  }

  /* ================================================================
     CLIENTES
     ================================================================ */
  const CLIENT_CHIPS = [
    { id: "all", label: "Todos", count: () => DATA.kpis.total },
    { id: "active", label: "Ativos", count: () => DATA.kpis.active },
    { id: "expiring", label: "A expirar", count: () => DATA.kpis.expiring },
    { id: "late", label: "Em atraso", count: () => DATA.kpis.late },
    { id: "inactive", label: "Inativos", count: () => DATA.kpis.inactive },
  ];

  function filteredClients() {
    const q = norm(state.clientQuery.trim());
    return DATA.clients.filter((c) => {
      const s = clientState(c).key;
      const f = state.clientFilter;
      if (f === "active" && !(s === "active" || s === "expiring")) return false;
      if (f === "expiring" && s !== "expiring") return false;
      if (f === "late" && s !== "late") return false;
      if (f === "inactive" && s !== "inactive") return false;
      if (state.clientPlan !== "all" && c.plan !== state.clientPlan) return false;
      if (q && !norm(`${c.name} ${c.id} ${c.phone} ${c.phone.replace(/\s/g, "")} ${c.zone} ${c.boxes.join(" ")}`).includes(q)) return false;
      return true;
    });
  }

  function clientRow(c) {
    const st = clientState(c), p = planById(c.plan), sel = state.selected.has(c.id);
    const box = c.boxes.length ? `<span class="mono">${c.boxes[0]}</span>${c.boxes.length > 1 ? ` <span class="tag">+${c.boxes.length - 1}</span>` : ""}` : `<span class="muted">Sem box</span>`;
    return `<tr class="clickable ${sel ? "selected" : ""}" data-client="${c.id}">
      <td class="w-check"><input type="checkbox" class="checkbox" data-select="${c.id}" ${sel ? "checked" : ""} aria-label="Selecionar ${esc(c.name)}"></td>
      <td class="o1"><div class="cell-main"><span class="avatar">${initials(c.name)}</span><div><strong>${esc(c.name)}</strong><small>#${c.id} · ${c.phone}</small></div></div></td>
      <td class="o3"><div><span>${esc(shortPlan(p))}</span><span class="cell-sub">${kz(p.price)} / mês</span></div></td>
      <td class="hide-sm">${box}</td>
      <td class="o2 right">${pill(st)}</td>
      <td class="o4 right"><div><span class="tnum">${date(c.due)}</span><span class="cell-sub">${rel(c.due)}</span></div></td>
      <td class="hide-sm"><span class="tnum">${date(c.lastPay)}</span><span class="cell-sub">Multicaixa</span></td>
      <td class="w-act hide-sm"><button class="icon-btn sm" data-action="toast" data-arg="Menu de ações do cliente (mockup)" aria-label="Mais ações">${icon("ellipsis", "sm")}</button></td>
    </tr>`;
  }

  function updateClients() {
    const rows = filteredClients();
    const body = $("#client-rows");
    if (!body) return;
    body.innerHTML = rows.length ? rows.map(clientRow).join("") : `<tr><td colspan="8"><div class="sr-empty">Nenhum cliente corresponde aos filtros.</div></td></tr>`;
    $$("[data-chip]").forEach((b) => b.classList.toggle("on", b.dataset.arg === state.clientFilter));
    const chip = CLIENT_CHIPS.find((c) => c.id === state.clientFilter);
    $("#client-count").textContent = `A mostrar ${rows.length} de ${int(chip.count())}`;
    updateBulk();
    refreshIcons();
  }

  function updateBulk() {
    const bar = $("#bulkbar");
    if (!bar) return;
    const n = state.selected.size;
    bar.classList.toggle("show", n > 0);
    $("#bulk-n").textContent = `${n} selecionado${n === 1 ? "" : "s"}`;
    const all = $("#select-all");
    if (all) {
      const visible = filteredClients();
      all.checked = visible.length > 0 && visible.every((c) => state.selected.has(c.id));
    }
  }

  function viewClientes(params) {
    if (params[0]) return viewCliente(params[0]);
    const html = `
    <div class="page-head">
      <div>
        <p class="eyebrow">Clientes</p>
        <h1>Clientes</h1>
        <p class="sub"><span class="dot"></span>${int(DATA.kpis.total)} clientes · sincronizado com o IXC há 4 min</p>
      </div>
      <div class="btn-row">
        <button class="btn" data-action="toast" data-arg="Sincronização com o IXC iniciada">${icon("refresh-cw", "sm")}Sincronizar IXC</button>
        <button class="btn" data-action="toast" data-arg="Lista de clientes exportada (CSV)">${icon("download", "sm")}Exportar</button>
        <button class="btn primary" data-action="toast" data-arg="Formulário de novo cliente (mockup)">${icon("user-plus", "sm")}Novo cliente</button>
      </div>
    </div>

    <div class="chips scroll-x" role="group" aria-label="Filtrar por estado">
      ${CLIENT_CHIPS.map((c) => `<button class="chip ${state.clientFilter === c.id ? "on" : ""}" data-chip data-action="client-chip" data-arg="${c.id}">${c.label} <b>${int(c.count())}</b></button>`).join("")}
    </div>

    <article class="card mt">
      <div class="toolbar">
        <div class="input-icon">${icon("search", "sm")}<input class="input" id="client-q" type="search" placeholder="Nome, telefone, nº IXC ou serial" value="${esc(state.clientQuery)}" aria-label="Pesquisar clientes"></div>
        <select class="select" id="client-plan" aria-label="Filtrar por plano">
          <option value="all">Todos os planos</option>
          ${DATA.plans.map((p) => `<option value="${p.id}" ${state.clientPlan === p.id ? "selected" : ""}>${esc(shortPlan(p))}</option>`).join("")}
        </select>
        <select class="select" aria-label="Filtrar por zona"><option>Todas as zonas</option><option>Talatona</option><option>Kilamba</option><option>Viana</option><option>Maianga</option><option>Cazenga</option></select>
        <select class="select desktop-only" aria-label="Ordenar"><option>Ordenar: validade</option><option>Ordenar: nome</option><option>Ordenar: último pagamento</option></select>
      </div>
      <div class="table-wrap">
        <table class="data responsive">
          <thead><tr>
            <th class="w-check"><input type="checkbox" class="checkbox" id="select-all" aria-label="Selecionar todos"></th>
            <th>Cliente</th><th>Plano</th><th>Box</th><th>Estado</th><th>Validade</th><th>Último pagamento</th><th class="w-act"></th>
          </tr></thead>
          <tbody id="client-rows"></tbody>
        </table>
      </div>
      <div class="table-foot">
        <span id="client-count"></span>
        <div class="pager"><button aria-label="Página anterior">‹</button><button class="on">1</button><button>2</button><button>3</button><button disabled>…</button><button>340</button><button aria-label="Página seguinte">›</button></div>
      </div>
    </article>

    <div class="bulkbar" id="bulkbar" role="region" aria-label="Ações em massa">
      <strong id="bulk-n"></strong>
      <button class="btn sm" data-action="bulk" data-arg="SMS com referência enviado aos clientes selecionados">${icon("message-square", "sm")}<span class="desktop-only">Enviar SMS</span></button>
      <button class="btn sm" data-action="bulk" data-arg="Referências Multicaixa geradas para os clientes selecionados">${icon("receipt", "sm")}<span class="desktop-only">Gerar referências</span></button>
      <button class="btn sm" data-action="bulk" data-arg="Clientes selecionados desativados e boxes bloqueadas">${icon("power-off", "sm")}<span class="desktop-only">Desativar</span></button>
      <button class="btn sm" data-action="bulk-clear" aria-label="Limpar seleção">${icon("x", "sm")}</button>
    </div>`;
    return {
      crumbs: ["Clientes"],
      html,
      fab: { icon: "user-plus", label: "Novo cliente", toast: "Formulário de novo cliente (mockup)" },
      mount() { updateClients(); },
    };
  }

  /* ---------------- cliente detalhe ---------------- */
  function clientPaymentRows(c) {
    const p = planById(c.plan);
    const st = clientState(c).key;
    return DATA.clientPayments.map((row, i) => {
      const r = Object.assign({}, row, { amount: p.price });
      if (c.id !== 10432) r.ref = String(+row.ref + c.id * 7).slice(0, 9);
      if (i === 0) {
        if (st === "late" || st === "inactive") Object.assign(r, { status: "expired", paid: null });
        else if (st === "active") Object.assign(r, { status: "paid", paid: c.lastPay });
      }
      return r;
    });
  }

  function viewCliente(id) {
    const c = clientById(id);
    if (!c) return { crumbs: ["Clientes", "Não encontrado"], html: `<a class="back-link" href="#/clientes">${icon("arrow-left", "sm")}Clientes</a><div class="card card-pad">Cliente não encontrado.</div>` };
    const st = clientState(c), p = planById(c.plan);
    const pays = clientPaymentRows(c);
    const open = pays.find((x) => x.status === "pending");
    const grid = p.grid ? gridById(p.grid) : null;
    const chs = p.grid ? gridChannels(p.grid) : [];
    const shown = chs.filter((x) => x.logo).slice(0, 10);
    const boxes = c.boxes.map((s) => DATA.boxes.find((b) => b.serial === s)).filter(Boolean);
    const since = D(c.since);

    const refBlock = open ? `
      <div class="ref-card">
        <span class="mcx">${icon("landmark", "lg")}</span>
        <div class="ref-fields">
          <div><small>Entidade</small><strong>11700</strong></div>
          <div><small>Referência</small><strong>${refFmt(open.ref)}</strong></div>
          <div><small>Valor</small><strong>${kz(open.amount)}</strong></div>
        </div>
        <div class="btn-row">
          <button class="btn sm" data-action="copy" data-arg="Entidade 11700 · Referência ${refFmt(open.ref)} · ${kz(open.amount)}">${icon("copy", "sm")}Copiar</button>
          <button class="btn sm" data-action="toast" data-arg="SMS reenviado para ${esc(c.phone)}">${icon("send", "sm")}Reenviar SMS</button>
        </div>
        <div class="ref-status">
          <span>${pill(PAY_STATE.pending)} &nbsp;Válida até ${date(DATA.payments.find((x) => x.ref === open.ref)?.due || c.due)}</span>
          <span class="sms-ok">${icon("check-check", "xs")}SMS entregue a 29/10 às 09:12</span>
        </div>
      </div>` : `
      <div class="ref-card">
        <span class="mcx" style="background:var(--surface-3);color:var(--text-2)">${icon("landmark", "lg")}</span>
        <div><strong>Sem referência em aberto</strong><p class="muted" style="font-size:13px;margin-top:2px">${st.key === "late" || st.key === "inactive" ? `A última referência expirou. Gere uma nova para regularizar.` : `A próxima será gerada automaticamente 7 dias antes de ${date(c.due)}.`}</p></div>
        <div class="btn-row"><button class="btn sm primary" data-action="toast" data-arg="Referência gerada e enviada por SMS para ${esc(c.phone)}">${icon("plus", "sm")}Gerar agora</button></div>
      </div>`;

    const boxBlock = boxes.length ? boxes.map((b) => {
      const bs = BOX_STATE[b.status];
      const g = gridById(b.grid);
      return `<div class="box-card">
        <div class="box-visual">
          <span class="box-device ${b.status === "offline" ? "off" : b.status === "blocked" ? "blocked" : ""}">${icon("tv")}</span>
          <div class="grow" style="min-width:0"><strong class="mono" style="font-size:14px">${b.serial}</strong><small class="muted" style="display:block;font-size:12.5px">Xiaomi TV Box S (2.ª ger.)</small></div>
          ${pill(bs)}
        </div>
        <div class="kv-list">
          <div class="kv-row"><span>Último contacto</span><strong>${esc(b.seen)}</strong></div>
          <div class="kv-row"><span>Versão da app</span><strong>${b.app}${b.app !== "0.8.0" ? ` <span class="tag">Atualização disponível</span>` : ""}</strong></div>
          <div class="kv-row"><span>Grelha</span><strong>${esc(g.name)} · v${g.published}</strong></div>
          <div class="kv-row"><span>Chave aprovada</span><strong>${date(b.approved)}</strong></div>
        </div>
        <div class="btn-row">
          ${b.status === "blocked"
            ? `<button class="btn sm" data-action="toast" data-arg="Box ${b.serial} desbloqueada">${icon("lock-open", "sm")}Desbloquear</button>`
            : `<button class="btn sm" data-action="toast" data-arg="Box ${b.serial} bloqueada">${icon("lock", "sm")}Bloquear</button>`}
          <button class="btn sm" data-action="toast" data-arg="Grelha reenviada para ${b.serial}">${icon("refresh-cw", "sm")}Reenviar grelha</button>
          <button class="btn sm ghost" data-action="toast" data-arg="Trocar box (mockup)">${icon("arrow-left-right", "sm")}Trocar</button>
        </div>
      </div>`;
    }).join(`<div style="border-top:1px solid var(--line)"></div>`) : `
      <div class="card-body"><div class="box-visual"><span class="box-device off">${icon("tv")}</span><div><strong>${p.grid ? "Sem box associada" : "Plano só de Internet"}</strong><small class="muted" style="display:block;font-size:12.5px">${p.grid ? "Associe uma box aprovada a este cliente." : "Mude para um plano com TV para associar uma box."}</small></div></div>
      ${p.grid ? `<div class="btn-row mt"><button class="btn sm primary" data-action="toast" data-arg="Escolher box por aprovar (mockup)">${icon("link", "sm")}Associar box</button></div>` : ""}</div>`;

    const html = `
    <a class="back-link" href="#/clientes">${icon("arrow-left", "sm")}Clientes</a>
    <div class="page-head">
      <div class="client-head">
        <span class="avatar lg">${initials(c.name)}</span>
        <div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h1>${esc(c.name)}</h1><span id="client-pill">${pill(st)}</span></div>
          <div class="client-meta">
            <span>${icon("hash", "xs")}IXC ${c.id}</span>
            <span>${icon("phone", "xs")}${c.phone}</span>
            <span class="desktop-only">${icon("mail", "xs")}${esc(c.email)}</span>
            <span>${icon("map-pin", "xs")}${esc(c.zone)}, Luanda</span>
            <span class="desktop-only">${icon("calendar", "xs")}Cliente desde ${MONTHS[since.getMonth()]} ${since.getFullYear()}</span>
          </div>
        </div>
      </div>
      <div class="btn-row">
        <label class="btn keep-sm" style="gap:10px;cursor:pointer">Ativo <span class="switch"><input type="checkbox" id="active-toggle" ${c.status !== "inactive" ? "checked" : ""} aria-label="Cliente ativo"><span></span></span></label>
        <button class="btn keep-sm" data-action="toast" data-arg="SMS enviado para ${esc(c.phone)}">${icon("message-square", "sm")}SMS</button>
        <button class="btn primary keep-sm" data-action="toast" data-arg="Referência Multicaixa gerada e enviada por SMS">${icon("receipt", "sm")}Gerar referência</button>
      </div>
    </div>

    <div class="detail-grid">
      <div class="grid">
        <article class="card">
          <div class="card-head"><h2>Contrato</h2><button class="btn sm" data-action="toast" data-arg="Alterar plano (mockup)">${icon("repeat", "sm")}Alterar plano</button></div>
          <div class="card-body">
            <div class="kv">
              <div><small>Plano</small><strong>${esc(shortPlan(p))}</strong><span>${esc(p.type)}</span></div>
              <div><small>Mensalidade</small><strong>${kz(p.price)}</strong><span>Débito por referência</span></div>
              <div><small>Validade</small><strong>${date(c.due)}</strong><span>${rel(c.due)}</span></div>
              <div><small>${p.speed ? "Velocidade" : "Canais"}</small><strong>${p.speed ? `${p.speed} Mbps` : p.channels}</strong><span>${p.grid ? `${p.channels} canais incluídos` : "Sem TV"}</span></div>
            </div>
          </div>
        </article>

        <article class="card">
          <div class="card-head"><div><h2>Referência Multicaixa</h2><p class="sub">Gerada via AppyPay · paga em qualquer ATM ou Multicaixa Express</p></div></div>
          <div class="mt">${refBlock}</div>
        </article>

        <article class="card">
          <div class="card-head"><div><h2>Pagamentos</h2><p class="sub">Últimos 6 meses</p></div><button class="link" data-action="toast" data-arg="Histórico completo exportado (CSV)">Exportar ${icon("download", "xs")}</button></div>
          <div class="table-wrap mt">
            <table class="data responsive">
              <thead><tr><th>Mês</th><th>Referência</th><th class="num">Valor</th><th>Emitida</th><th>Paga em</th><th>Estado</th></tr></thead>
              <tbody>
                ${pays.map((x) => `<tr>
                  <td class="o1"><strong>${x.month}</strong></td>
                  <td class="hide-sm"><span class="mono">${refFmt(x.ref)}</span></td>
                  <td class="num o3">${kz(x.amount)}</td>
                  <td class="hide-sm tnum">${date(x.issued)}</td>
                  <td class="o4 right tnum">${x.paid ? date(x.paid) : `<span class="muted">—</span>`}</td>
                  <td class="o2 right">${pill(PAY_STATE[x.status])}</td>
                </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <div class="grid">
        <article class="card">
          <div class="card-head"><div><h2>Box${boxes.length > 1 ? "es" : ""}</h2><p class="sub">${boxes.length ? `${boxes.length} associada${boxes.length > 1 ? "s" : ""}` : "Nenhuma box"}</p></div></div>
          ${boxBlock}
        </article>

        <article class="card">
          <div class="card-head"><div><h2>Grelha de canais</h2><p class="sub">${grid ? `${esc(grid.name)} · ${chs.length} canais · publicada v${grid.published}` : "Este plano não inclui TV"}</p></div>${grid ? `<a class="link" href="#/canais/grelhas">Editar ${icon("arrow-right", "xs")}</a>` : ""}</div>
          <div class="card-body">
            ${grid ? `
              <div class="logo-strip">${shown.map((x) => logoTile(x, "sm")).join("")}<span class="more-tile">+${chs.length - shown.length}</span></div>
              <div class="chips mt" style="gap:6px">${p.packs.map((pk) => `<span class="tag">${icon(CAT_ICON[pk], "xs")}${esc(pk)}</span>`).join("")}</div>
              <div class="btn-row mt"><button class="btn sm" data-action="toast" data-arg="Adicionar pack extra (mockup)">${icon("plus", "sm")}Adicionar pack</button></div>` : `<p class="muted">Sem canais. Associe um plano com TV para ver a grelha.</p>`}
          </div>
        </article>

        <article class="card">
          <div class="card-head"><h2>Histórico</h2></div>
          <div class="feed">
            <div class="feed-item"><span class="feed-ico gold">${icon("message-square")}</span><div><p>SMS com referência <b>${open ? refFmt(open.ref) : "—"}</b> entregue</p><time>29/10/2026, 09:12 · automático</time></div></div>
            <div class="feed-item"><span class="feed-ico good">${icon("circle-check")}</span><div><p>Pagamento de <b>${kz(p.price)}</b> confirmado</p><time>${date(c.lastPay)} · AppyPay</time></div></div>
            ${boxes[0] ? `<div class="feed-item"><span class="feed-ico">${icon("list-video")}</span><div><p>Grelha <b>${esc(gridById(boxes[0].grid).name)} v${gridById(boxes[0].grid).published}</b> sincronizada na box</p><time>28/10/2026, 22:40 · TvBox</time></div></div>` : ""}
            <div class="feed-item"><span class="feed-ico">${icon("user-plus")}</span><div><p>Cliente integrado do IXC</p><time>${date(c.since)} · sincronização</time></div></div>
          </div>
        </article>
      </div>
    </div>`;

    return {
      crumbs: ["Clientes", c.name],
      html,
      mount(view) {
        const t = $("#active-toggle", view);
        t.addEventListener("change", () => {
          c.status = t.checked ? "active" : "inactive";
          $("#client-pill").innerHTML = pill(clientState(c));
          refreshIcons();
          toast(t.checked ? `${c.name} ativado — box desbloqueada` : `${c.name} desativado — box bloqueada`, t.checked ? "circle-check" : "power-off");
        });
      },
    };
  }

  /* ================================================================
     BOXES
     ================================================================ */
  function viewBoxes() {
    const b = DATA.kpis.boxes;
    const filters = [
      { id: "all", label: "Todas" }, { id: "online", label: "Online" }, { id: "offline", label: "Offline" },
      { id: "blocked", label: "Bloqueadas" }, { id: "old", label: "App desatualizada" },
    ];
    const rows = DATA.boxes.filter((x) => state.boxFilter === "all" || (state.boxFilter === "old" ? x.app !== "0.8.0" : x.status === state.boxFilter));
    const tvClients = DATA.clients.filter((c) => planById(c.plan).grid);

    const html = `
    <div class="page-head">
      <div><p class="eyebrow">Clientes</p><h1>Boxes</h1><p class="sub"><span class="dot"></span>${int(b.total)} registadas · ${int(b.online)} ligadas agora</p></div>
      <div class="btn-row">
        <button class="btn" data-action="toast" data-arg="Atualização 0.8.0 enviada para 359 boxes">${icon("upload", "sm")}Atualizar app</button>
        <button class="btn primary" data-action="toast" data-arg="Registar box por serial (mockup)">${icon("plus", "sm")}Registar box</button>
      </div>
    </div>

    <article class="card">
      <div class="stat-strip">
        <div class="stat-cell"><small>${icon("tv", "sm")}Total</small><strong>${int(b.total)}</strong><span>em ${int(3708)} clientes com TV</span></div>
        <div class="stat-cell"><small><span class="dot"></span>Online</small><strong>${int(b.online)}</strong><span>${pct((b.online / b.total) * 100)}</span></div>
        <div class="stat-cell"><small><span class="dot off"></span>Offline</small><strong>${int(b.offline)}</strong><span>sem contacto há +1 h</span></div>
        <div class="stat-cell"><small><span class="dot crit"></span>Bloqueadas</small><strong>${int(b.blocked)}</strong><span>falta de pagamento</span></div>
        <div class="stat-cell"><small><span class="dot warn"></span>Por aprovar</small><strong data-count="boxes">${pendingCount()}</strong><span>pedidos de instalação</span></div>
      </div>
    </article>

    ${state.pending.length ? `
    <article class="card approval mt">
      <div class="approval-head">
        <span class="kpi-icon">${icon("key-round", "sm")}</span>
        <div class="grow" style="flex:1;min-width:200px"><h2 style="font-size:14.5px">Chaves por aprovar</h2><p class="muted" style="font-size:12.5px">Cada chave só é válida para a box que a gerou — o MAC não serve de identidade.</p></div>
        <button class="btn sm" data-action="toast" data-arg="Lista completa de pedidos (mockup)"><span>Ver todos (<span data-count="boxes">${pendingCount()}</span>)</span></button>
      </div>
      ${state.pending.map((x) => `
        <div class="approval-item" data-pending="${x.serial}">
          <div><strong class="mono">${x.serial}</strong><small>${esc(x.model)}</small></div>
          <div class="hide-sm"><strong>${esc(x.tech)}</strong><small>${esc(x.requested)} · ${esc(x.zone)}</small></div>
          <div class="hide-sm hide-md"><select class="select" style="width:100%" aria-label="Cliente para ${x.serial}">
            <option value="">Escolher cliente…</option>
            ${tvClients.map((c) => `<option value="${c.id}" ${x.suggest === c.id ? "selected" : ""}>${esc(c.name)} · #${c.id}</option>`).join("")}
          </select></div>
          <div class="btn-row">
            <button class="btn sm ghost" data-action="reject-box" data-arg="${x.serial}" aria-label="Rejeitar ${x.serial}">${icon("x", "sm")}<span class="desktop-only">Rejeitar</span></button>
            <button class="btn sm primary" data-action="approve-box" data-arg="${x.serial}">${icon("check", "sm")}Aprovar</button>
          </div>
        </div>`).join("")}
    </article>` : ""}

    <article class="card mt">
      <div class="toolbar">
        <div class="chips scroll-x">${filters.map((f) => `<button class="chip ${state.boxFilter === f.id ? "on" : ""}" data-action="box-filter" data-arg="${f.id}">${f.label}</button>`).join("")}</div>
        <div class="input-icon narrow">${icon("search", "sm")}<input class="input" type="search" placeholder="Serial ou cliente" aria-label="Pesquisar boxes"></div>
      </div>
      <div class="table-wrap">
        <table class="data responsive">
          <thead><tr><th>Box</th><th>Cliente</th><th>Grelha</th><th>Estado</th><th>App</th><th>Último contacto</th><th class="w-act"></th></tr></thead>
          <tbody>
            ${rows.map((x) => {
              const c = clientById(x.client), g = gridById(x.grid);
              return `<tr class="clickable" data-client="${c.id}">
                <td class="o1"><div class="cell-main"><span class="box-device ${x.status === "offline" ? "off" : x.status === "blocked" ? "blocked" : ""}" style="width:34px;height:34px;border-radius:10px">${icon("tv", "sm")}</span><div><strong class="mono">${x.serial}</strong><small>Xiaomi TV Box S</small></div></div></td>
                <td class="o3"><div><span>${esc(c.name)}</span><span class="cell-sub">#${c.id}</span></div></td>
                <td class="hide-sm"><span>${esc(g.name)}</span><span class="cell-sub">v${g.published}</span></td>
                <td class="o2 right">${pill(BOX_STATE[x.status])}</td>
                <td class="hide-sm">${x.app}${x.app !== "0.8.0" ? ` <span class="tag">${icon("arrow-up", "xs")}0.8.0</span>` : ""}</td>
                <td class="o4 right"><span class="muted">${esc(x.seen)}</span></td>
                <td class="w-act hide-sm"><button class="icon-btn sm" data-action="toast" data-arg="Ações da box ${x.serial} (mockup)" aria-label="Ações">${icon("ellipsis", "sm")}</button></td>
              </tr>`;
            }).join("") || `<tr><td colspan="7"><div class="sr-empty">Nenhuma box neste filtro.</div></td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="table-foot"><span>A mostrar ${rows.length} de ${int(b.total)}</span><div class="pager"><button>‹</button><button class="on">1</button><button>2</button><button disabled>…</button><button>315</button><button>›</button></div></div>
    </article>`;

    return { crumbs: ["Boxes"], html, fab: { icon: "scan-line", label: "Ler box", toast: "Câmara aberta para ler o código da box (mockup)" } };
  }

  /* ================================================================
     PLANOS
     ================================================================ */
  function viewPlanos() {
    const html = `
    <div class="page-head">
      <div><p class="eyebrow">Serviço</p><h1>Planos</h1><p class="sub">${DATA.plans.length} planos ativos · ${int(DATA.kpis.active)} clientes · ${mkz(DATA.plans.reduce((a, p) => a + p.clients * p.price, 0) / 1e6)} / mês</p></div>
      <div class="btn-row"><button class="btn primary" data-action="toast" data-arg="Editor de novo plano (mockup)">${icon("plus", "sm")}Novo plano</button></div>
    </div>
    <div class="plans">
      ${DATA.plans.map((p) => `
        <article class="card plan">
          <div class="plan-top">
            <div class="plan-type"><span class="tag">${icon(p.type === "TV" ? "tv" : p.grid ? "wifi" : "wifi", "xs")}${esc(p.type)}</span>${p.featured ? `<span class="pill gold">${icon("star")}Mais vendido</span>` : ""}</div>
            <h3>${esc(p.name)}</h3>
            <div class="plan-price">${int(p.price)}<small> Kz / mês</small></div>
            <div class="plan-metrics">
              <div><small>Velocidade</small><strong>${p.speed ? `${p.speed} Mbps` : "—"}</strong></div>
              <div><small>Canais</small><strong>${p.channels || "—"}</strong></div>
              <div><small>Clientes</small><strong>${int(p.clients)}</strong></div>
            </div>
            <div class="chips" style="gap:6px">${p.packs.length ? p.packs.map((pk) => `<span class="tag">${icon(CAT_ICON[pk], "xs")}${esc(pk)}</span>`).join("") : `<span class="muted" style="font-size:12.5px">Sem TV — apenas Internet</span>`}</div>
          </div>
          <div class="plan-foot"><span>Receita: <b class="text-2">${mkz((p.clients * p.price) / 1e6)}</b> / mês</span><button class="btn sm" data-action="toast" data-arg="Editar ${esc(p.name)} (mockup)">${icon("pencil", "sm")}Editar</button></div>
        </article>`).join("")}
      <button class="card plan new" data-action="toast" data-arg="Editor de novo plano (mockup)">
        <div><span class="kpi-icon">${icon("plus")}</span><strong>Novo plano</strong><p class="muted" style="font-size:12.5px;margin-top:4px">Combine velocidade e packs de canais</p></div>
      </button>
    </div>`;
    return { crumbs: ["Planos"], html };
  }

  /* ================================================================
     CANAIS & GRELHAS
     ================================================================ */
  function ensureLineup() {
    if (!state.lineup) state.lineup = gridChannels(state.gridId).map((c) => c.n);
  }

  function viewCanais(params) {
    const tab = ["grelhas", "catalogo", "packs"].includes(params[0]) ? params[0] : state.canaisTab;
    state.canaisTab = tab;
    const tabs = [
      { id: "grelhas", label: "Grelhas", count: DATA.grids.length, ico: "list-ordered" },
      { id: "catalogo", label: "Catálogo", count: CH.length, ico: "library" },
      { id: "packs", label: "Packs", count: CATS.length, ico: "package" },
    ];
    let body = "";
    let mount = null;
    if (tab === "grelhas") { const g = gridEditor(); body = g.html; mount = g.mount; }
    if (tab === "catalogo") body = catalog();
    if (tab === "packs") body = packs();

    const html = `
    <div class="page-head">
      <div><p class="eyebrow">Serviço</p><h1>Canais & grelhas</h1><p class="sub">${CH.length} canais no catálogo · ${DATA.grids.length} grelhas publicadas em ${int(DATA.kpis.boxes.total)} boxes</p></div>
      <div class="btn-row">
        <button class="btn" data-action="toast" data-arg="Importar lista XML de canais (mockup)">${icon("file-up", "sm")}Importar XML</button>
        <button class="btn primary" data-action="toast" data-arg="Formulário de novo canal (mockup)">${icon("plus", "sm")}Novo canal</button>
      </div>
    </div>
    <nav class="tabs" aria-label="Secções">${tabs.map((t) => `<a href="#/canais/${t.id}" class="${tab === t.id ? "on" : ""}">${icon(t.ico, "sm")}${t.label} <span class="count">${t.count}</span></a>`).join("")}</nav>
    <div id="canais-body">${body}</div>`;
    return { crumbs: ["Canais & grelhas", tabs.find((t) => t.id === tab).label], html, mount };
  }

  function gridEditor() {
    ensureLineup();
    const g = gridById(state.gridId);
    const inGrid = new Set(state.lineup);
    const q = norm(state.libQuery);
    const library = CH.filter((c) => !inGrid.has(c.n) && (!q || norm(`${c.name} ${c.cat}`).includes(q)));
    const isDraft = state.draftChanges > 0;

    const html = `
    <div class="editor-head">
      <div class="seg grid-picker" role="group" aria-label="Escolher grelha">
        ${DATA.grids.map((x) => `<button class="${x.id === state.gridId ? "on" : ""}" data-action="grid-pick" data-arg="${x.id}">${esc(x.name)}</button>`).join("")}
      </div>
      <div class="grow"></div>
      <span class="pill ${isDraft ? "gold" : "good"}" id="draft-pill">${isDraft ? `${icon("pencil")}Rascunho v${state.draftVersion} · ${state.draftChanges} alteraç${state.draftChanges === 1 ? "ão" : "ões"}` : `${icon("circle-check")}Publicada v${g.published}`}</span>
      <div class="btn-row">
        <button class="btn" data-action="discard-grid" ${isDraft ? "" : "disabled"}>${icon("undo-2", "sm")}Descartar</button>
        <button class="btn primary" data-action="publish-grid" ${isDraft ? "" : "disabled"}>${icon("send", "sm")}Publicar v${isDraft ? state.draftVersion : g.published + 1}</button>
      </div>
    </div>

    <div class="grid-editor">
      <article class="card">
        <div class="card-head"><div><h2>Biblioteca</h2><p class="sub">${library.length} canais fora desta grelha</p></div></div>
        <div class="toolbar" style="border-bottom:1px solid var(--line);margin-top:10px">
          <div class="input-icon" style="max-width:none">${icon("search", "sm")}<input class="input" id="lib-q" type="search" placeholder="Procurar canal" value="${esc(state.libQuery)}" aria-label="Procurar canal na biblioteca"></div>
        </div>
        <div class="ch-list" id="lib-list">
          ${library.map((c) => `
            <div class="ch-row">
              ${logoTile(c, "sm")}
              <div class="grow"><strong>${esc(c.name)}</strong><small>${c.cat} · ${String(c.n).padStart(3, "0")}</small></div>
              <button class="btn xs" data-action="lineup-add" data-arg="${c.n}" aria-label="Adicionar ${esc(c.name)} à grelha">${icon("plus", "xs")}Adicionar</button>
            </div>`).join("") || `<div class="sr-empty">Todos os canais estão nesta grelha.</div>`}
        </div>
      </article>

      <article class="card">
        <div class="lineup-bar">
          <span><b class="text-2" style="color:var(--text)">${esc(g.name)}</b> · ${state.lineup.length} canais · publicada v${g.published} em ${int(g.boxes)} boxes</span>
          <button class="link" data-action="toast" data-arg="Pré-visualização enviada para a box de testes ZTV-0000-TEST">${icon("monitor-play", "xs")}Ver na box de testes</button>
        </div>
        <div class="ch-list" id="lineup" aria-label="Ordem dos canais na grelha">
          ${state.lineup.map((n, i) => {
            const c = chByN(n);
            return `<div class="ch-row" draggable="true" data-n="${n}">
              <span class="handle" aria-hidden="true">${icon("grip-vertical", "sm")}</span>
              <input class="pos" type="number" min="1" max="${state.lineup.length}" value="${i + 1}" data-pos="${n}" aria-label="Posição de ${esc(c.name)}">
              ${logoTile(c, "sm")}
              <div class="grow"><strong>${esc(c.name)}</strong><small>${c.cat}</small></div>
              <div class="row-acts">
                <button class="icon-btn sm" data-action="lineup-move" data-arg="${n}" data-dir="-1" aria-label="Subir">${icon("chevron-up", "sm")}</button>
                <button class="icon-btn sm" data-action="lineup-move" data-arg="${n}" data-dir="1" aria-label="Descer">${icon("chevron-down", "sm")}</button>
                <button class="icon-btn sm" data-action="lineup-remove" data-arg="${n}" aria-label="Remover ${esc(c.name)}">${icon("x", "sm")}</button>
              </div>
            </div>`;
          }).join("")}
        </div>
      </article>
    </div>`;

    function mount(view) {
      const list = $("#lineup", view);
      let dragN = null;
      list.addEventListener("dragstart", (e) => {
        const row = e.target.closest(".ch-row");
        if (!row) return;
        dragN = +row.dataset.n;
        row.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", String(dragN)); } catch (err) { /* ignore */ }
      });
      list.addEventListener("dragover", (e) => {
        e.preventDefault();
        $$(".drop-above", list).forEach((r) => r.classList.remove("drop-above"));
        const row = e.target.closest(".ch-row");
        if (row && +row.dataset.n !== dragN) row.classList.add("drop-above");
      });
      list.addEventListener("dragend", () => { $$(".dragging, .drop-above", list).forEach((r) => r.classList.remove("dragging", "drop-above")); });
      list.addEventListener("drop", (e) => {
        e.preventDefault();
        const row = e.target.closest(".ch-row");
        if (!row || dragN == null) return;
        const target = +row.dataset.n;
        if (target === dragN) return;
        const from = state.lineup.indexOf(dragN);
        state.lineup.splice(from, 1);
        state.lineup.splice(state.lineup.indexOf(target), 0, dragN);
        touchDraft();
        const y = list.scrollTop;
        rerender();
        $("#lineup").scrollTop = y;
      });
    }
    return { html, mount };
  }

  function touchDraft() {
    if (state.draftChanges === 0) {
      const g = gridById(state.gridId);
      state.draftVersion = g.published + 1;
    }
    state.draftChanges += 1;
  }

  function catalog() {
    const q = norm(state.catQuery);
    const list = CH.filter((c) => (state.catCat === "all" || c.cat === state.catCat) && (!q || norm(`${c.name} ${c.n}`).includes(q)));
    const per = 20;
    const pages = Math.max(1, Math.ceil(list.length / per));
    state.catPage = Math.min(state.catPage, pages);
    const slice = list.slice((state.catPage - 1) * per, state.catPage * per);
    const inGrids = (c) => DATA.grids.filter((g) => GRID_PACKS[g.id].includes(c.cat)).map((g) => g.name.replace("TV ", ""));
    return `
    <article class="card">
      <div class="toolbar">
        <div class="input-icon">${icon("search", "sm")}<input class="input" id="cat-q" type="search" placeholder="Nome ou número do canal" value="${esc(state.catQuery)}" aria-label="Procurar no catálogo"></div>
        <select class="select" id="cat-cat" aria-label="Filtrar por categoria">
          <option value="all">Todas as categorias</option>
          ${CATS.map((c) => `<option ${state.catCat === c ? "selected" : ""}>${c}</option>`).join("")}
        </select>
      </div>
      <div class="table-wrap">
        <table class="data responsive">
          <thead><tr><th style="width:64px">Nº</th><th>Canal</th><th>Categoria</th><th>Endereço multicast</th><th>Grelhas</th><th>Estado</th><th class="w-act"></th></tr></thead>
          <tbody>
            ${slice.map((c) => `<tr>
              <td class="hide-sm"><span class="mono muted">${String(c.n).padStart(3, "0")}</span></td>
              <td class="o1"><div class="cell-main">${logoTile(c, "sm")}<div><strong>${esc(c.name)}</strong><small class="mono">${String(c.n).padStart(3, "0")}</small></div></div></td>
              <td class="o3"><span class="tag">${icon(CAT_ICON[c.cat], "xs")}${c.cat}</span></td>
              <td class="hide-sm"><span class="mono text-2">${c.mc}</span></td>
              <td class="hide-sm"><div class="chips" style="gap:4px">${inGrids(c).map((g) => `<span class="tag">${g}</span>`).join("")}</div></td>
              <td class="o2 right">${pill({ label: "Ativo", tone: "good", icon: "circle-check" })}</td>
              <td class="w-act hide-sm"><button class="icon-btn sm" data-action="toast" data-arg="Editar ${esc(c.name)} (mockup)" aria-label="Editar">${icon("pencil", "sm")}</button></td>
            </tr>`).join("") || `<tr><td colspan="7"><div class="sr-empty">Nenhum canal encontrado.</div></td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="table-foot">
        <span>A mostrar ${slice.length} de ${list.length} canais</span>
        <div class="pager">
          <button data-action="cat-page" data-arg="${state.catPage - 1}" ${state.catPage === 1 ? "disabled" : ""} aria-label="Página anterior">‹</button>
          ${Array.from({ length: pages }, (_, i) => `<button class="${i + 1 === state.catPage ? "on" : ""}" data-action="cat-page" data-arg="${i + 1}">${i + 1}</button>`).join("")}
          <button data-action="cat-page" data-arg="${state.catPage + 1}" ${state.catPage === pages ? "disabled" : ""} aria-label="Página seguinte">›</button>
        </div>
      </div>
    </article>`;
  }

  function packs() {
    return `<div class="packs">
      ${CATS.map((cat) => {
        const chs = CH.filter((c) => c.cat === cat);
        const logos = chs.filter((c) => c.logo).slice(0, 5);
        const usedIn = DATA.plans.filter((p) => p.packs.includes(cat));
        return `<article class="card pack">
          <div class="pack-head"><h3><span class="kpi-icon">${icon(CAT_ICON[cat], "sm")}</span>${esc(cat)}</h3><span class="tag">${chs.length} canais</span></div>
          <p>${esc(CAT_DESC[cat])}</p>
          <div class="logo-strip">${logos.map((c) => logoTile(c, "sm")).join("")}${chs.length > logos.length ? `<span class="more-tile">+${chs.length - logos.length}</span>` : ""}</div>
          <div class="pack-foot"><span>Em ${usedIn.length} plano${usedIn.length === 1 ? "" : "s"}</span><button class="btn xs" data-action="toast" data-arg="Editar pack ${esc(cat)} (mockup)">${icon("pencil", "xs")}Editar</button></div>
        </article>`;
      }).join("")}
      <button class="card plan new" style="min-height:200px" data-action="toast" data-arg="Criar pack (mockup)"><div><span class="kpi-icon">${icon("package-plus")}</span><strong>Novo pack</strong><p class="muted" style="font-size:12.5px;margin-top:4px">Agrupe canais para vender como extra</p></div></button>
    </div>`;
  }

  /* ================================================================
     PAGAMENTOS
     ================================================================ */
  function viewPagamentos() {
    const r = DATA.refsMonth, m = DATA.monthly;
    const delta = (m.received[11] / m.received[10] - 1) * 100;
    const filters = [
      { id: "all", label: "Todas" }, { id: "paid", label: "Pagas" }, { id: "pending", label: "Pendentes" },
      { id: "expired", label: "Expiradas" }, { id: "smsfail", label: "SMS falhado" },
    ];
    const rows = DATA.payments.filter((x) => state.payFilter === "all" || (state.payFilter === "smsfail" ? x.sms === "fail" : x.status === state.payFilter));
    const maxDay = DATA.daily.indexOf(Math.max(...DATA.daily));

    const html = `
    <div class="page-head">
      <div><p class="eyebrow">Financeiro</p><h1>Pagamentos</h1><p class="sub">Referências Multicaixa via AppyPay · entidade 11700</p></div>
      <div class="btn-row">
        <button class="btn" data-action="toast" data-arg="Pagamentos de outubro exportados (CSV para contabilidade)">${icon("download", "sm")}Exportar CSV</button>
        <button class="btn primary" data-action="toast" data-arg="Gerar referência avulsa (mockup)">${icon("plus", "sm")}Gerar referência</button>
      </div>
    </div>

    <div class="btn-row" style="justify-content:space-between;margin-bottom:16px">
      <div class="month-nav"><button class="icon-btn sm" aria-label="Mês anterior" data-action="toast" data-arg="Setembro 2026 (mockup)">${icon("chevron-left", "sm")}</button><strong>Outubro 2026</strong><button class="icon-btn sm" aria-label="Mês seguinte" disabled>${icon("chevron-right", "sm")}</button></div>
    </div>

    <article class="card">
      <div class="pay-kpis stat-strip">
        <div class="stat-cell"><small>${icon("receipt", "sm")}Emitido</small><strong>${mkz(r.issuedKz)}</strong><span>${int(r.issued)} referências</span></div>
        <div class="stat-cell"><small><span class="dot"></span>Recebido</small><strong>${mkz(r.paidKz)}</strong><span class="delta up">${icon("arrow-up-right", "xs")}+${dec(delta)}% vs set.</span></div>
        <div class="stat-cell"><small>${icon("percent", "sm")}Taxa de cobrança</small><strong>${pct((r.paid / r.issued) * 100)}</strong><span>${int(r.paid)} pagas</span></div>
        <div class="stat-cell"><small><span class="dot warn"></span>Pendente</small><strong>${mkz(r.pendingKz)}</strong><span>${int(r.pending)} referências</span></div>
        <div class="stat-cell"><small><span class="dot crit"></span>Expirado</small><strong>${mkz(r.expiredKz)}</strong><span>${int(r.expired)} referências</span></div>
      </div>
    </article>

    <article class="card mt">
      <div class="card-head"><div><h2>Recebido por dia</h2><p class="sub">Outubro 2026 · pico a ${maxDay + 1} de outubro</p></div></div>
      <div class="card-body">
        <div class="chart" id="chart-daily"></div>
        <div class="chart-table" id="daily-table" ${state.dailyTable ? "" : "hidden"}>
          <div class="table-wrap"><table class="data"><thead><tr><th>Dia</th><th class="num">Recebido</th></tr></thead><tbody>${DATA.daily.map((v, i) => `<tr><td>${i + 1} out.</td><td class="num">${mkz(v)}</td></tr>`).join("")}</tbody></table></div>
        </div>
      </div>
      <div class="card-foot"><span>Valores em milhões de Kwanzas</span><button class="link" data-action="toggle-table" data-arg="dailyTable">${icon("table-2", "xs")}<span>${state.dailyTable ? "Esconder tabela" : "Ver tabela"}</span></button></div>
    </article>

    <article class="card mt">
      <div class="toolbar">
        <div class="chips scroll-x">${filters.map((f) => `<button class="chip ${state.payFilter === f.id ? "on" : ""}" data-action="pay-filter" data-arg="${f.id}">${f.label}</button>`).join("")}</div>
        <div class="input-icon narrow">${icon("search", "sm")}<input class="input" type="search" placeholder="Referência ou cliente" aria-label="Pesquisar pagamentos"></div>
      </div>
      <div class="table-wrap">
        <table class="data responsive">
          <thead><tr><th>Referência</th><th>Cliente</th><th class="num">Valor</th><th>Emitida</th><th>SMS</th><th>Paga em</th><th>Estado</th><th class="w-act"></th></tr></thead>
          <tbody>
            ${rows.map((x) => {
              const c = clientById(x.client);
              return `<tr class="clickable" data-client="${c.id}">
                <td class="o1"><div><strong class="mono">${refFmt(x.ref)}</strong><span class="cell-sub">Entidade 11700</span></div></td>
                <td class="o3"><div><span>${esc(c.name)}</span><span class="cell-sub">#${c.id}</span></div></td>
                <td class="num o4 right"><strong>${kz(x.amount)}</strong></td>
                <td class="hide-sm tnum">${date(x.issued)}</td>
                <td class="hide-sm">${x.sms === "ok" ? `<span class="sms-ok">${icon("check-check", "xs")}Entregue</span>` : `<span class="sms-fail">${icon("circle-x", "xs")}Falhou</span>`}</td>
                <td class="hide-sm tnum">${x.paid ? date(x.paid) : `<span class="muted">—</span>`}</td>
                <td class="o2 right">${pill(PAY_STATE[x.status])}</td>
                <td class="w-act hide-sm">${x.status !== "paid" ? `<button class="icon-btn sm" data-action="toast" data-arg="SMS reenviado para ${esc(c.name)}" aria-label="Reenviar SMS" title="Reenviar SMS">${icon("send", "sm")}</button>` : ""}</td>
              </tr>`;
            }).join("") || `<tr><td colspan="8"><div class="sr-empty">Nenhuma referência neste filtro.</div></td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="table-foot"><span>A mostrar ${rows.length} de ${int(r.issued)} referências</span><div class="pager"><button>‹</button><button class="on">1</button><button>2</button><button disabled>…</button><button>240</button><button>›</button></div></div>
    </article>`;

    return {
      crumbs: ["Pagamentos"],
      html,
      fab: { icon: "plus", label: "Referência", toast: "Gerar referência avulsa (mockup)" },
      mount(view) {
        const el = $("#chart-daily", view);
        const draw = () => columnChart(el, {
          labels: DATA.daily.map((_, i) => String(i + 1)), values: DATA.daily, max: 3, ticks: [0, 1, 2, 3],
          tickFmt: (t) => `${t} M`, aria: "Valor recebido por dia em outubro de 2026", height: 220, fill: 0.62,
          labelEvery: 5, mark: maxDay, markFmt: (v) => `${dec(v, 2)} M`,
        });
        draw();
        charts.push(draw);
        bindTooltip(el, (i) => `<div class="tt-title">${i + 1} de outubro</div><div class="tt-row"><span>Recebido</span><b>${mkz(DATA.daily[i])}</b></div>`);
      },
    };
  }

  /* ================================================================
     UTILIZADORES
     ================================================================ */
  function viewUtilizadores() {
    const roles = [
      { name: "Administrador", ico: "shield-check", desc: "Acesso total, integrações e utilizadores" },
      { name: "Cobrança", ico: "receipt", desc: "Pagamentos, referências e SMS" },
      { name: "Técnico de campo", ico: "smartphone", desc: "Boxes e aprovação de chaves no telemóvel" },
      { name: "Apoio ao cliente", ico: "headset", desc: "Consulta de clientes e reenvio de SMS" },
    ];
    const html = `
    <div class="page-head">
      <div><p class="eyebrow">Sistema</p><h1>Utilizadores</h1><p class="sub">${DATA.users.length} utilizadores · ${DATA.users.reduce((a, u) => a + u.sessions, 0)} sessões ativas</p></div>
      <div class="btn-row"><button class="btn primary" data-action="toast" data-arg="Convite enviado por email (mockup)">${icon("user-plus", "sm")}Convidar</button></div>
    </div>
    <div class="row-2-even" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">
      ${roles.map((r) => `<article class="card card-pad"><div class="kpi-top"><strong>${r.name}</strong><span class="kpi-icon">${icon(r.ico, "sm")}</span></div><p class="muted" style="font-size:12.5px;margin-top:6px">${r.desc}</p><p style="margin-top:12px;font-size:12.5px"><b>${DATA.users.filter((u) => u.role === r.name).length}</b> <span class="muted">utilizador(es)</span></p></article>`).join("")}
    </div>
    <article class="card mt">
      <div class="table-wrap">
        <table class="data responsive">
          <thead><tr><th>Utilizador</th><th>Perfil</th><th>Último acesso</th><th>Sessões</th><th>Ativo</th><th class="w-act"></th></tr></thead>
          <tbody>
            ${DATA.users.map((u) => `<tr>
              <td class="o1"><div class="cell-main"><span class="avatar ${u.name === "Paulo Tavares" ? "gold" : ""}">${initials(u.name)}</span><div><strong>${esc(u.name)}</strong><small>${esc(u.email)}</small></div></div></td>
              <td class="o3"><span class="tag">${esc(u.role)}</span></td>
              <td class="o4 right muted">${esc(u.last)}</td>
              <td class="hide-sm">${u.sessions ? `${u.sessions} <button class="link" data-action="toast" data-arg="Sessões de ${esc(u.name)} revogadas">revogar</button>` : `<span class="muted">—</span>`}</td>
              <td class="o2 right"><span class="switch"><input type="checkbox" ${u.active ? "checked" : ""} aria-label="${esc(u.name)} ativo"><span></span></span></td>
              <td class="w-act hide-sm"><button class="icon-btn sm" data-action="toast" data-arg="Editar ${esc(u.name)} (mockup)" aria-label="Editar">${icon("pencil", "sm")}</button></td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </article>`;
    return { crumbs: ["Utilizadores"], html };
  }

  /* ================================================================
     DEFINIÇÕES
     ================================================================ */
  function smsPreview(tpl) {
    const vals = { nome: "Ana", valor: "12 500 Kz", validade: "03/11", entidade: "11700", referencia: "932 104 558" };
    return tpl.replace(/\{(\w+)\}/g, (m0, k) => (vals[k] != null ? vals[k] : m0));
  }

  function viewDefinicoes() {
    const ints = DATA.integrations.concat([{ name: "OfficeGest", desc: "Faturação certificada", state: "off", meta: "Por configurar" }]);
    const msg = smsPreview(state.smsTemplate);
    const html = `
    <div class="page-head">
      <div><p class="eyebrow">Sistema</p><h1>Definições</h1><p class="sub">${icon("lock", "xs")}As chaves das integrações ficam no servidor — nunca no código</p></div>
    </div>
    <div class="settings">
      <nav class="settings-nav" aria-label="Secções das definições">
        <a href="#/definicoes" class="on">${icon("plug", "sm")}Integrações</a>
        <a href="#/definicoes">${icon("message-square", "sm")}Mensagens SMS</a>
        <a href="#/definicoes">${icon("timer", "sm")}Agendamentos</a>
        <a href="#/definicoes">${icon("shield", "sm")}Segurança</a>
      </nav>
      <div class="grid">
        <article class="card">
          <div class="card-head"><div><h2>Integrações</h2><p class="sub">Os sistemas que o backoffice junta num só sítio</p></div></div>
          <div class="card-body">
            <div class="int-grid">
              ${ints.map((i) => `<div class="int-card">
                <div class="int-card-head"><span class="int-logo">${esc(i.name.slice(0, 2).toUpperCase())}</span><div style="flex:1;min-width:0"><strong>${esc(i.name)}</strong><small class="muted" style="display:block;font-size:12px">${esc(i.desc)}</small></div></div>
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                  ${i.state === "ok" ? pill({ label: "Ligado", tone: "good", icon: "circle-check" }) : i.state === "warn" ? pill({ label: "Atenção", tone: "warning", icon: "triangle-alert" }) : pill({ label: "Desligado", tone: "", icon: "circle-dashed" })}
                  <button class="btn xs" data-action="toast" data-arg="Configurar ${esc(i.name)} (mockup)">Configurar</button>
                </div>
                <small class="text-2" style="font-size:12px">${esc(i.meta)}</small>
              </div>`).join("")}
            </div>
          </div>
        </article>

        <article class="card">
          <div class="card-head"><div><h2>Mensagem SMS da referência</h2><p class="sub">Enviada pela WeSender quando a referência é gerada</p></div></div>
          <div class="card-body sms-preview">
            <div class="field">
              <label for="sms-tpl">Modelo</label>
              <textarea class="input" id="sms-tpl" rows="5">${esc(state.smsTemplate)}</textarea>
              <div class="chips" style="gap:6px">${["nome", "valor", "validade", "entidade", "referencia"].map((v) => `<button class="tag" style="border:0;cursor:pointer" data-action="sms-var" data-arg="{${v}}">{${v}}</button>`).join("")}</div>
              <small class="muted" id="sms-count">${msg.length} / 160 caracteres · ${Math.ceil(msg.length / 160)} SMS</small>
            </div>
            <div class="phone" aria-label="Pré-visualização">
              <div class="phone-top">ZON · agora</div>
              <div class="bubble" id="sms-bubble">${esc(msg)}</div>
            </div>
          </div>
          <div class="card-foot"><span>Alterações aplicam-se às próximas referências</span><button class="btn sm primary" data-action="toast" data-arg="Modelo de SMS guardado">${icon("save", "sm")}Guardar</button></div>
        </article>

        <article class="card">
          <div class="card-head"><div><h2>Agendamentos</h2><p class="sub">Tarefas automáticas de faturação</p></div></div>
          <div class="jobs mt">
            ${DATA.jobs.map((j) => `<div class="job">
              <div><strong>${esc(j.name)}</strong><small>${esc(j.desc)}</small></div>
              <span class="tag desktop-only">${icon("timer", "xs")}${esc(j.every)}</span>
              <span class="pill good">${icon("circle-check")}${esc(j.last)}</span>
            </div>`).join("")}
          </div>
        </article>
      </div>
    </div>`;
    return {
      crumbs: ["Definições"],
      html,
      mount(view) {
        const ta = $("#sms-tpl", view);
        ta.addEventListener("input", () => {
          state.smsTemplate = ta.value;
          const t = smsPreview(ta.value);
          $("#sms-bubble").textContent = t;
          $("#sms-count").textContent = `${t.length} / 160 caracteres · ${Math.max(1, Math.ceil(t.length / 160))} SMS`;
        });
      },
    };
  }

  /* ================================================================
     LOGIN
     ================================================================ */
  function viewLogin() {
    $("#root").innerHTML = `
    <div class="login">
      <section class="login-art">
        ${LOGO}
        <div>
          <h2>Clientes, boxes, canais e pagamentos. Num só sítio.</h2>
          <p>O backoffice da ZON junta o IXC, a AppyPay, a WeSender e a gestão das TvBox numa única aplicação — no computador e no telemóvel.</p>
          <div class="login-pills"><span>Multicaixa</span><span>SMS</span><span>TvBox</span><span>Grelhas</span><span>IXC</span></div>
        </div>
        <small style="color:#80898F">© 2026 ZON · Luanda</small>
      </section>
      <section class="login-form">
        <form id="login-form">
          <div><p class="eyebrow">Zon Backoffice</p><h1>Entrar</h1></div>
          <div class="field"><label for="email">Email</label><input class="input" id="email" type="email" autocomplete="username" placeholder="nome@zon.ao"></div>
          <div class="field"><label for="pw">Palavra-passe</label><input class="input" id="pw" type="password" autocomplete="current-password" placeholder="••••••••"></div>
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" class="checkbox">Manter sessão</label><a class="link" href="#/entrar">Esqueci-me</a></div>
          <button class="btn primary block" type="submit" style="height:44px">Entrar ${icon("arrow-right", "sm")}</button>
          <p class="muted" style="font-size:12px;text-align:center">Sessão protegida por cookie seguro · mockup sem autenticação real</p>
        </form>
      </section>
    </div>`;
    refreshIcons();
    document.title = "Entrar · Zon Backoffice";
    $("#login-form").addEventListener("submit", (e) => { e.preventDefault(); location.hash = "#/dashboard"; });
  }

  /* ================================================================
     GLOBAL SEARCH
     ================================================================ */
  function hideResults() {
    const sr = $("#sr");
    if (sr) sr.hidden = true;
    const tb = $("#topbar");
    if (tb) tb.classList.remove("search-open");
  }

  function bindSearch() {
    const q = $("#q"), sr = $("#sr");
    const run = () => {
      const v = norm(q.value.trim());
      if (!v) { sr.hidden = true; return; }
      const cl = DATA.clients.filter((c) => norm(`${c.name} ${c.id} ${c.phone.replace(/\s/g, "")}`).includes(v.replace(/\s/g, "")) || norm(c.name).includes(v)).slice(0, 4);
      const bx = DATA.boxes.filter((b) => norm(b.serial).includes(v)).slice(0, 3);
      const rf = DATA.payments.filter((p) => p.ref.includes(v.replace(/\s/g, ""))).slice(0, 3);
      let h = "";
      if (cl.length) h += `<div class="sr-group">Clientes</div>` + cl.map((c) => `<a class="sr-item" href="#/clientes/${c.id}"><span class="avatar" style="width:28px;height:28px;font-size:11px">${initials(c.name)}</span>${esc(c.name)}<small>#${c.id}</small></a>`).join("");
      if (bx.length) h += `<div class="sr-group">Boxes</div>` + bx.map((b) => `<a class="sr-item" href="#/clientes/${b.client}">${icon("tv", "sm")}<span class="mono">${b.serial}</span><small>${esc(clientById(b.client).name)}</small></a>`).join("");
      if (rf.length) h += `<div class="sr-group">Referências</div>` + rf.map((p) => `<a class="sr-item" href="#/clientes/${p.client}">${icon("receipt", "sm")}<span class="mono">${refFmt(p.ref)}</span><small>${kz(p.amount)}</small></a>`).join("");
      sr.innerHTML = h || `<div class="sr-empty">Sem resultados para “${esc(q.value)}”</div>`;
      sr.hidden = false;
      refreshIcons();
    };
    q.addEventListener("input", run);
    q.addEventListener("focus", run);
    q.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { q.value = ""; hideResults(); q.blur(); }
      if (e.key === "Enter") { const first = $(".sr-item", sr); if (first) { location.hash = first.getAttribute("href"); q.value = ""; q.blur(); } }
    });
    sr.addEventListener("click", () => { q.value = ""; });
    document.addEventListener("click", (e) => { if (!e.target.closest("#search") && !e.target.closest("[data-action='open-search']")) hideResults(); });
  }

  /* ================================================================
     GLOBAL EVENTS
     ================================================================ */
  document.addEventListener("click", (e) => {
    const sel = e.target.closest("[data-select]");
    if (sel) return;
    const a = e.target.closest("[data-action]");
    if (!a) {
      const tr = e.target.closest("tr[data-client]");
      if (tr && !e.target.closest("button, a, input, select, label")) location.hash = `#/clientes/${tr.dataset.client}`;
      return;
    }
    const arg = a.dataset.arg;
    switch (a.dataset.action) {
      case "toast": e.preventDefault(); toast(arg, "info"); break;
      case "fab": toast(a.dataset.arg, "info"); break;
      case "theme": {
        const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
        document.documentElement.dataset.theme = next;
        store.set("zon-theme", next);
        charts.forEach((f) => f());
        break;
      }
      case "seg": $$("button", a.parentElement).forEach((b) => b.classList.toggle("on", b === a)); break;
      case "open-sheet": document.body.classList.add("sheet-open"); break;
      case "close-sheet": document.body.classList.remove("sheet-open"); break;
      case "open-search": $("#topbar").classList.add("search-open"); $("#q").focus(); break;
      case "clients-filter":
        e.preventDefault();
        state.clientFilter = arg;
        if (location.hash === "#/clientes") rerender(); else location.hash = "#/clientes";
        break;
      case "client-chip": state.clientFilter = arg; updateClients(); break;
      case "bulk": toast(`${arg} (${state.selected.size})`, "circle-check"); state.selected.clear(); updateClients(); break;
      case "bulk-clear": state.selected.clear(); updateClients(); break;
      case "copy":
        try { navigator.clipboard.writeText(arg); } catch (err) { /* sem clipboard */ }
        toast("Referência copiada", "copy");
        break;
      case "toggle-table": {
        state[arg] = !state[arg];
        const tbl = arg === "chartTable" ? $("#rev-table") : $("#daily-table");
        tbl.hidden = !state[arg];
        $("span", a).textContent = state[arg] ? "Esconder tabela" : "Ver tabela";
        break;
      }
      case "approve-box": {
        const row = a.closest("[data-pending]");
        const s = row && $("select", row);
        const c = s && s.value ? clientById(s.value) : null;
        state.pending = state.pending.filter((x) => x.serial !== arg);
        state.approved += 1;
        toast(c ? `Box ${arg} aprovada e associada a ${c.name}` : `Box ${arg} aprovada — falta associar cliente`, "key-round");
        rerender();
        updateCounts();
        break;
      }
      case "reject-box":
        state.pending = state.pending.filter((x) => x.serial !== arg);
        state.approved += 1;
        toast(`Pedido da box ${arg} rejeitado`, "x");
        rerender();
        updateCounts();
        break;
      case "box-filter": state.boxFilter = arg; rerender(); break;
      case "pay-filter": state.payFilter = arg; rerender(); break;
      case "grid-pick": {
        if (arg === state.gridId) break;
        state.gridId = arg;
        state.lineup = null;
        const g = gridById(arg);
        state.draftChanges = g.draft ? g.changes : 0;
        state.draftVersion = g.draft || g.published + 1;
        rerender();
        break;
      }
      case "lineup-add": {
        ensureLineup();
        state.lineup.push(+arg);
        touchDraft();
        rerender();
        const list = $("#lineup");
        list.scrollTop = list.scrollHeight;
        const row = list.lastElementChild;
        if (row) row.classList.add("added");
        toast(`${chByN(+arg).name} adicionado na posição ${state.lineup.length}`, "plus");
        break;
      }
      case "lineup-remove": {
        const y = $("#lineup").scrollTop;
        state.lineup = state.lineup.filter((n) => n !== +arg);
        touchDraft();
        rerender();
        $("#lineup").scrollTop = y;
        break;
      }
      case "lineup-move": {
        const i = state.lineup.indexOf(+arg);
        const j = i + +a.dataset.dir;
        if (j < 0 || j >= state.lineup.length) break;
        const y = $("#lineup").scrollTop;
        [state.lineup[i], state.lineup[j]] = [state.lineup[j], state.lineup[i]];
        touchDraft();
        rerender();
        $("#lineup").scrollTop = y;
        break;
      }
      case "publish-grid": {
        const g = gridById(state.gridId);
        g.published = state.draftVersion;
        g.draft = null;
        state.draftChanges = 0;
        state.draftVersion = g.published + 1;
        toast(`${g.name} v${g.published} publicada — ${int(g.boxes)} boxes vão sincronizar`, "send");
        rerender();
        break;
      }
      case "discard-grid": {
        const g = gridById(state.gridId);
        g.draft = null;
        state.lineup = null;
        state.draftChanges = 0;
        state.draftVersion = g.published + 1;
        toast("Rascunho descartado", "undo-2");
        rerender();
        break;
      }
      case "cat-page": state.catPage = Math.max(1, +arg); rerender(); break;
      case "sms-var": {
        const ta = $("#sms-tpl");
        const pos = ta.selectionStart || ta.value.length;
        ta.value = ta.value.slice(0, pos) + arg + ta.value.slice(pos);
        ta.dispatchEvent(new Event("input"));
        ta.focus();
        break;
      }
      default: break;
    }
  });

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.matches("[data-select]")) {
      const id = +t.dataset.select;
      if (t.checked) state.selected.add(id); else state.selected.delete(id);
      t.closest("tr").classList.toggle("selected", t.checked);
      updateBulk();
    } else if (t.id === "select-all") {
      filteredClients().forEach((c) => (t.checked ? state.selected.add(c.id) : state.selected.delete(c.id)));
      updateClients();
    } else if (t.id === "client-plan") {
      state.clientPlan = t.value;
      updateClients();
    } else if (t.id === "cat-cat") {
      state.catCat = t.value;
      state.catPage = 1;
      rerender();
    } else if (t.matches("[data-pos]")) {
      const n = +t.dataset.pos;
      const to = Math.min(state.lineup.length, Math.max(1, +t.value)) - 1;
      state.lineup = state.lineup.filter((x) => x !== n);
      state.lineup.splice(to, 0, n);
      touchDraft();
      rerender();
      const row = $(`#lineup [data-n="${n}"]`);
      if (row) { row.scrollIntoView({ block: "center" }); row.classList.add("added"); }
    } else if (t.closest(".switch") && !t.id) {
      toast(t.checked ? "Utilizador ativado" : "Utilizador desativado — sessões terminadas", t.checked ? "circle-check" : "power-off");
    }
  });

  let typingTimer = null;
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "client-q") { state.clientQuery = t.value; updateClients(); }
    if (t.id === "lib-q" || t.id === "cat-q") {
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        if (t.id === "lib-q") state.libQuery = t.value; else { state.catQuery = t.value; state.catPage = 1; }
        const id = t.id, pos = t.selectionStart;
        rerender();
        const el = document.getElementById(id);
        el.focus();
        el.setSelectionRange(pos, pos);
      }, 180);
    }
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      const q = $("#q");
      if (q) { e.preventDefault(); $("#topbar").classList.add("search-open"); q.focus(); }
    }
    if (e.key === "Escape") document.body.classList.remove("sheet-open");
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => charts.forEach((f) => f()), 120);
  });

  window.addEventListener("hashchange", () => route(true));

  /* ---------------- boot ---------------- */
  document.documentElement.dataset.theme = store.get("zon-theme") || "dark";
  route(true);
})();
