// Webhook da newsletter RPG -> planilha "RPG — Newsletter — Destinatários" (aba Destinatários).
// Publicado como App da Web (Executar como: eu / Acesso: qualquer pessoa). Chamado só pelo servidor do site.
const SHEET_ID = '13CKTkL7nj1TiMRfSUHqAYoTNzx9w9oCGQfJUojP_PlE';
const TAB = 'Destinatários';
const ORIGEM = 'Site RPG';

function doGet() {
  return json_({ ok: true, service: 'rpg-newsletter-sheet' });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'json_invalido' }); }
  if (!body) return json_({ ok: false, error: 'json_invalido' });
  const itens = Array.isArray(body.items) ? body.items : [body];
  const modo = body.mode === 'missing-only' ? 'missing-only' : 'upsert';
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    return json_(Object.assign({ ok: true }, sincronizar_(itens, modo)));
  } finally {
    lock.releaseLock();
  }
}

// Regras: e-mail (trim+minúsculas) é a chave; nunca cria segunda linha; nunca altera
// Ativo, Descadastrado, Data de descadastro, Último envio nem Observações de linha existente.
function sincronizar_(itens, modo) {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB);
  const ultima = sh.getLastRow();
  const emails = ultima > 1 ? sh.getRange(2, 3, ultima - 1, 1).getValues() : [];
  const indice = {};
  emails.forEach(function (r, i) { const em = norm_(r[0]); if (em && !(em in indice)) indice[em] = i + 2; });
  let added = 0, updated = 0, existing = 0;
  const novos = [];
  itens.forEach(function (it) {
    const email = norm_(it && it.email);
    if (email.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    const linha = indice[email];
    if (!linha) {
      novos.push([txt_(it.id), txt_(it.name), email, txt_(it.company), txt_(it.city), ORIGEM, data_(it.createdAt), 'SIM', 'NÃO', '', '', '']);
      indice[email] = -1;
      added++;
      return;
    }
    if (linha < 0) return;
    existing++;
    if (modo !== 'upsert') return;
    const atual = sh.getRange(linha, 1, 1, 6).getDisplayValues()[0];
    const quer = { 1: txt_(it.name), 3: txt_(it.company), 4: txt_(it.city), 5: ORIGEM };
    if (!String(atual[0]).trim() && txt_(it.id)) quer[0] = txt_(it.id);
    Object.keys(quer).forEach(function (c) {
      const v = quer[c];
      if (v && String(atual[c]).trim() !== v.replace(/^'/, '')) { sh.getRange(linha, Number(c) + 1).setValue(v); updated++; }
    });
  });
  if (novos.length) sh.getRange(sh.getLastRow() + 1, 1, novos.length, 12).setValues(novos);
  return { added: added, updated: updated, existing: existing };
}

function norm_(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

// Texto puro: impede que algo como =IMPORTXML(...) vire fórmula.
function txt_(v) {
  const s = String(v == null ? '' : v).trim().slice(0, 200);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function data_(v) {
  let d = v ? new Date(v) : new Date();
  if (isNaN(d.getTime())) d = new Date();
  return Utilities.formatDate(d, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
