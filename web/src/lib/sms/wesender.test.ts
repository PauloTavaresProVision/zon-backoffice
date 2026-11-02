import assert from "node:assert/strict";
import { test } from "node:test";
import { readWesenderReply } from "./wesender";

test("WeSender: só conta como enviada com Exito e todas as mensagens enviadas", () => {
  // Formato da documentação e da API verdadeira ("Mensagem" ou "Message")
  assert.equal(readWesenderReply(200, { Exito: true, Mensagem: "Foram enviados 1 de 1 mensagens", Objeto: { SMS: 0 } }), "Foram enviados 1 de 1 mensagens");
  assert.equal(readWesenderReply(200, { Exito: true, Message: "A sua solicitação de envio foi efectuada com sucesso", Objeto: { SMS: 1 } }), "A sua solicitação de envio foi efectuada com sucesso");
  assert.throws(() => readWesenderReply(200, { Exito: true, Mensagem: "Foram enviados 0 de 1 mensagens" }), /0 de 1/);
  assert.throws(() => readWesenderReply(200, { Exito: false, Mensagem: "Saldo insuficiente" }), /Saldo insuficiente/);
  // Sem Exito não se assume que saiu (o formato antigo que só o simulador usava)
  assert.throws(() => readWesenderReply(200, { succeeded: true, message: "ok", data: { id: 1 } }), /WeSender/);
  assert.throws(() => readWesenderReply(200, null), /sem confirmação/);
  assert.throws(() => readWesenderReply(401, { Exito: false }), /recusou a chave/);
  assert.throws(() => readWesenderReply(500, null), /HTTP 500/);
});
