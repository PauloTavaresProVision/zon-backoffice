import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLineup, channelInput, diffLineup, diffSummary, guessCategory, isMulticast, lineupProblem, normName, parseSdns, type CatalogChannel } from "./rules";

const cat = (id: number, name: string, extra: Partial<CatalogChannel> = {}): CatalogChannel =>
  ({ id, name, ip: `232.10.0.${id}`, port: 1234, category: "Outros", active: true, ...extra });
const CATALOG = new Map([1, 2, 3, 4, 5, 6].map((id) => [id, cat(id, `Canal ${id}`)]));
const lineup = (ids: number[], byId = CATALOG) => buildLineup(ids, byId);

test("canal: as mesmas regras da box", () => {
  assert.deepEqual(channelInput({ name: "  TPA   1 ", ip: "232.10.5.2", port: "1234", category: "Angola" }), { name: "TPA 1", ip: "232.10.5.2", port: 1234, category: "Angola" });
  assert.throws(() => channelInput({ name: "", ip: "232.10.5.2", port: 1234, category: "Angola" }), /nome/);
  assert.throws(() => channelInput({ name: "x".repeat(121), ip: "232.10.5.2", port: 1234, category: "Angola" }), /nome/);
  assert.throws(() => channelInput({ name: "TPA", ip: "10.0.0.1", port: 1234, category: "Angola" }), /multicast/);
  assert.throws(() => channelInput({ name: "TPA", ip: "232.10.5.2", port: 70000, category: "Angola" }), /porta/);
  assert.throws(() => channelInput({ name: "TPA", ip: "232.10.5.2", port: 1234, category: "Novelas" }), /categoria/);
  assert.equal(isMulticast("224.0.0.0"), true);
  assert.equal(isMulticast("239.255.255.255"), true);
  assert.equal(isMulticast("240.0.0.1"), false);
  assert.equal(isMulticast("232.10.5"), false);
  assert.equal(isMulticast("232.10.5.256"), false);
});

test("categoria dos canais novos: a heurística da app", () => {
  assert.equal(guessCategory("TPA Notícias"), "Angola");
  assert.equal(guessCategory("SS Premier League"), "Desporto");
  assert.equal(guessCategory("Cartoon Network"), "Infantil");
  assert.equal(guessCategory("CNN International"), "Notícias");
  assert.equal(guessCategory("Rádio Nacional"), "Rádio");
  assert.equal(guessCategory("Canal Qualquer"), "Outros");
  assert.equal(normName(" Notícias "), "noticias");
});

test("grelha: o número na TV é a posição; inativos e repetidos ficam de fora", () => {
  const byId = new Map(CATALOG);
  byId.set(3, cat(3, "Canal 3", { active: false }));
  const l = lineup([5, 3, 1, 5, 99, 2], byId);
  assert.deepEqual(l.ids, [5, 1, 2]);
  assert.deepEqual(l.channels.map((c) => [c.number, c.name]), [[1, "Canal 5"], [2, "Canal 1"], [3, "Canal 2"]]);
  assert.equal(lineupProblem([]), "A grelha está vazia: adicione pelo menos um canal.");
  assert.equal(lineupProblem(l.channels), null);
  assert.match(lineupProblem([...l.channels, { ...l.channels[0]!, number: 4 }]) ?? "", /mesmo endereço/);
});

test("alterações: entradas, saídas e só os canais arrastados contam como movidos", () => {
  const before = lineup([1, 2, 3, 4, 5]);
  assert.equal(diffLineup(before, lineup([1, 2, 3, 4, 5])).total, 0);

  // O 5 vai para o topo: um movido, mas todos mudam de número
  const top = diffLineup(before, lineup([5, 1, 2, 3, 4]));
  assert.equal(top.moved, 1);
  assert.equal(top.renumbered, 5);
  assert.equal(top.total, 1);

  // Troca de dois vizinhos: um movido
  assert.equal(diffLineup(before, lineup([2, 1, 3, 4, 5])).moved, 1);

  const d = diffLineup(before, lineup([1, 6, 3, 4, 5]));
  assert.deepEqual(d.added, [6]);
  assert.deepEqual(d.removed, [2]);
  assert.equal(d.moved, 0);
  assert.equal(d.renumbered, 0, "o 6 fica no lugar do 2");
  assert.equal(diffSummary(d), "+1 · −1");

  // Canal editado no catálogo depois de publicado
  const edited = new Map(CATALOG);
  edited.set(4, cat(4, "Canal 4 HD"));
  const e = diffLineup(before, lineup([1, 2, 3, 4, 5], edited));
  assert.deepEqual(e.edited, [4]);
  assert.equal(diffSummary(e), "1 editado");

  // Nunca publicada: tudo é novo
  assert.equal(diffLineup(null, lineup([1, 2])).added.length, 2);
});

const service = (lcn: number, name: string, ip: string, port = 1234) => `
  <dvb:SingleService>
    <dvb:ServiceLocation><dvb:IPMulticastAddress Source="${ip}" Port="${port}" /></dvb:ServiceLocation>
    <dvb:TextualIdentifier ServiceName="${name}" />
    <dvb:DVBTriplet OrigNetId="0" TSId="17001" ServiceId="716" />
    <dvb:LogicalChannelNumber>${lcn}</dvb:LogicalChannelNumber>
  </dvb:SingleService>`;
const sdns = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<dvb:ServiceDiscovery xmlns:dvb="urn:dvb:metadata:iptv:sdns:2008-1" xmlns:tva="urn:tva:metadata:2005">
  <dvb:BroadcastDiscovery DomainName="." Version="4"><dvb:ServiceList>${body}</dvb:ServiceList></dvb:BroadcastDiscovery>
</dvb:ServiceDiscovery>`;

test("XML do headend: lê serviços, ordena pelo número lógico", () => {
  const list = parseSdns(sdns(service(2, "TPA 2", "232.10.5.3") + "<!-- <dvb:SingleService> comentado -->" + service(1, "Tom &amp; Jerry", "232.10.5.2")));
  assert.deepEqual(list, [
    { number: 1, name: "Tom & Jerry", ip: "232.10.5.2", port: 1234 },
    { number: 2, name: "TPA 2", ip: "232.10.5.3", port: 1234 },
  ]);
  const plain = `<ServiceDiscovery xmlns="urn:dvb:metadata:iptv:sdns:2008-1">${service(7, "Zap", "232.1.1.1").replace(/dvb:/g, "")}</ServiceDiscovery>`;
  assert.equal(parseSdns(plain)[0]?.number, 7, "sem prefixo");
});

test("XML do headend: recusa o que a box também recusaria", () => {
  assert.throws(() => parseSdns(`<!DOCTYPE x [<!ENTITY a "b">]>${sdns(service(1, "A", "232.1.1.1"))}`), /DTD/);
  assert.throws(() => parseSdns(sdns(service(1, "A", "232.1.1.1")).replace("sdns:2008-1", "outra")), /Formato/);
  assert.throws(() => parseSdns(sdns("")), /entre 1 e/);
  assert.throws(() => parseSdns(sdns(service(1, "A", "10.1.1.1"))), /multicast/);
  assert.throws(() => parseSdns(sdns(service(1, "A", "232.1.1.1") + service(1, "B", "232.1.1.2"))), /números de canal repetidos/);
  assert.throws(() => parseSdns(sdns(service(1, "A", "232.1.1.1") + service(2, "B", "232.1.1.1"))), /repetidos/);
  assert.throws(() => parseSdns(sdns(service(1, "A", "232.1.1.1").replace(/<dvb:LogicalChannelNumber>.*<\/dvb:LogicalChannelNumber>/, ""))), /LogicalChannelNumber/);
});
