// RPG Cobrança (Tap to Pay SumUp) — edge function única.
// Auth:  usuário do site (Bearer JWT Supabase) · aparelho pareado (x-rpg-device) · servidor/Rafa (Bearer service role)
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const FN_BASE = `${URL_}/functions/v1/rpg-tap`;
const APK_URL = `${URL_}/storage/v1/object/public/rpg-apps/rpg-cobranca.apk`;
const APP_PACKAGE = "br.com.rpgcapital.ttpmvp";
const RAFA_WHATSAPP_URL = "https://wa.me/5511936201445";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-rpg-device",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (status: number, code: string, message: string) => json({ ok: false, code, message }, status);

async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ---------- autenticação ----------
function bearer(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}
const isServer = (req: Request) => { const t = bearer(req); return !!t && t === SERVICE; };

async function userFor(req: Request) {
  const t = bearer(req);
  if (!t || t === SERVICE) return null;
  const { data } = await db.auth.getUser(t);
  return data?.user ?? null;
}
async function userCanUseStore(userId: string, storeId: string) {
  const { data: store } = await db.from("inventory_v1_stores").select("business_id").eq("id", storeId).maybeSingle();
  if (!store?.business_id) return false;
  const { data } = await db.from("balcao_business_members").select("user_id")
    .eq("business_id", store.business_id).eq("user_id", userId).eq("active", true).maybeSingle();
  return !!data;
}
async function deviceFor(req: Request) {
  const tok = req.headers.get("x-rpg-device") ?? "";
  if (tok.length < 20) return null;
  const { data } = await db.from("rpg_tap_devices").select("id, store_id, revoked_at")
    .eq("token_hash", await sha256(tok)).maybeSingle();
  if (!data || data.revoked_at) return null;
  db.from("rpg_tap_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id).then(() => {});
  return data as { id: string; store_id: string };
}

// ---------- SumUp ----------
async function sumupMe(key: string) {
  const r = await fetch("https://api.sumup.com/v0.1/me", { headers: { Authorization: `Bearer ${key}` } });
  if (!r.ok) return { ok: false as const, status: r.status };
  const d = await r.json();
  return { ok: true as const, merchant: d?.merchant_profile?.merchant_code as string, country: d?.merchant_profile?.country as string };
}

// ---------- WhatsApp (Rafa) ----------
async function notifyStore(storeId: string, text: string, idem: string) {
  const { data: binds } = await db.from("wa_store_bindings").select("wa_id").eq("store_id", storeId);
  for (const b of binds ?? []) {
    await db.from("wa_outbox").insert({
      idempotency_key: `${idem}:${b.wa_id}`, to_phone: b.wa_id, kind: "text", payload: { body: text },
    });
  }
}

function chargeLink(id: string) { return `${FN_BASE}/c/${id}`; }

function validUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function finalizeInventorySale(row: any) {
  if (row.inventory_finalized_at) return { ok: true as const, already: true };
  const payload = row.sale_payload as any;
  const rawItems = Array.isArray(payload?.items) ? payload.items : [];
  if (!rawItems.length) return { ok: true as const, skipped: true };

  const saleId = validUuid(payload?.saleId) ? payload.saleId : crypto.randomUUID();
  const movementIds = Array.isArray(payload?.movementIds) ? payload.movementIds : [];
  const lines = rawItems.map((item: any, index: number) => ({
    productId: String(item?.productId ?? ""),
    quantityMilli: Math.round(Number(item?.quantityMilli)),
    movementId: validUuid(movementIds[index]) ? movementIds[index] : crypto.randomUUID(),
  }));
  if (lines.some((line: any) => !validUuid(line.productId) || !(line.quantityMilli > 0))) {
    await db.from("rpg_tap_charges").update({ inventory_error: "invalid_sale_payload", updated_at: new Date().toISOString() }).eq("id", row.id);
    return { ok: false as const, error: "invalid_sale_payload" };
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: store } = await db.from("inventory_v1_stores")
      .select("installation_id,state_version").eq("id", row.store_id).eq("active", true).maybeSingle();
    if (!store?.installation_id) return { ok: false as const, error: "store_not_found" };

    const { data: snapshot, error: stateError } = await db.rpc("inventory_v1_get_state", { p_installation_id: store.installation_id });
    if (stateError || !snapshot?.found || !snapshot?.state) return { ok: false as const, error: "state_not_found" };
    const state = snapshot.state as any;
    const products = Array.isArray(state.products) ? state.products : [];
    const sales = Array.isArray(state.sales) ? state.sales : [];
    const movements = Array.isArray(state.movements) ? state.movements : [];

    if (sales.some((sale: any) => sale?.id === saleId)) {
      const now = new Date().toISOString();
      await db.from("rpg_tap_charges").update({ sale_id: saleId, inventory_finalized_at: now, inventory_error: null, updated_at: now }).eq("id", row.id);
      return { ok: true as const, already: true };
    }

    const byId = new Map(products.map((product: any) => [String(product.id), product]));
    const saleItems: any[] = [];
    let totalCents = 0;
    let cogsCents = 0;

    for (const line of lines) {
      const product: any = byId.get(line.productId);
      if (!product || product.deletedAt) return { ok: false as const, error: "product_not_found" };
      const stock = Math.round(Number(product.stockMilli ?? 0));
      const price = Math.round(Number(product.priceCents ?? 0));
      const cost = Math.max(0, Math.round(Number(product.averageCostCents ?? 0)));
      if (price <= 0) return { ok: false as const, error: "product_without_price" };
      if (stock < line.quantityMilli) return { ok: false as const, error: "insufficient_stock" };
      const lineTotal = Math.round(price * line.quantityMilli / 1000);
      const lineCost = Math.round(cost * line.quantityMilli / 1000);
      totalCents += lineTotal;
      cogsCents += lineCost;
      saleItems.push({
        productId: line.productId,
        quantityMilli: line.quantityMilli,
        unitPriceCents: price,
        lineTotalCents: lineTotal,
        unitCostCents: cost,
        lineCostCents: lineCost,
      });
    }

    if (totalCents !== Number(row.amount_cents)) {
      await db.from("rpg_tap_charges").update({ inventory_error: "amount_mismatch", updated_at: new Date().toISOString() }).eq("id", row.id);
      return { ok: false as const, error: "amount_mismatch" };
    }

    const completedAt = row.completed_at || new Date().toISOString();
    const soldProducts = products.map((product: any) => {
      const line = lines.find((candidate: any) => candidate.productId === String(product.id));
      return line ? { ...product, stockMilli: Math.round(Number(product.stockMilli ?? 0)) - line.quantityMilli } : product;
    });
    const sale = {
      id: saleId,
      createdAt: completedAt,
      totalCents,
      cogsCents,
      grossProfitCents: totalCents - cogsCents,
      items: saleItems,
      payment: { method: "card", confirmedAt: completedAt },
    };
    const saleMovements = lines.map((line: any) => ({
      id: line.movementId,
      productId: line.productId,
      type: "sale",
      quantityMilli: -line.quantityMilli,
      createdAt: completedAt,
      note: `Venda ${saleId.slice(0, 8)}`,
    }));
    const nextState = {
      ...state,
      products: soldProducts,
      sales: [sale, ...sales],
      movements: [...movements, ...saleMovements],
    };

    const { error: syncError } = await db.rpc("rafa_sync_state_checked", {
      p_store_id: row.store_id,
      p_state: nextState,
      p_app_version: "v10.5",
      p_expected_version: Number(store.state_version ?? 0),
    });
    if (!syncError) {
      const now = new Date().toISOString();
      await db.from("rpg_tap_charges").update({ sale_id: saleId, inventory_finalized_at: now, inventory_error: null, updated_at: now }).eq("id", row.id);
      return { ok: true as const };
    }
    if (!String(syncError.message || "").includes("state_version_conflict")) {
      await db.from("rpg_tap_charges").update({ inventory_error: String(syncError.message || "sync_failed").slice(0, 500), updated_at: new Date().toISOString() }).eq("id", row.id);
      return { ok: false as const, error: "sync_failed" };
    }
  }

  await db.from("rpg_tap_charges").update({ inventory_error: "state_version_conflict", updated_at: new Date().toISOString() }).eq("id", row.id);
  return { ok: false as const, error: "state_version_conflict" };
}

// ---------- ações ----------
async function handle(req: Request, body: any): Promise<Response> {
  const action = String(body?.action ?? "");

  // 1) Site: lojista cola a chave sup_sk_ da conta SumUp dele
  if (action === "connect") {
    const user = await userFor(req);
    if (!user) return fail(401, "auth", "Faça login na RPG.");
    const storeId = String(body.store_id ?? ""); const key = String(body.api_key ?? "").trim();
    if (!(await userCanUseStore(user.id, storeId))) return fail(403, "forbidden", "Você não tem acesso a esta loja.");
    if (!key.startsWith("sup_sk_")) return fail(400, "key_format", "A chave precisa começar com sup_sk_ (chave secreta da SumUp).");
    const me = await sumupMe(key);
    if (!me.ok) return fail(400, "key_invalid", `A SumUp não aceitou essa chave (HTTP ${me.status}). Gere uma nova e tente de novo.`);
    if (me.country && me.country !== "BR") return fail(400, "country", `Conta SumUp de ${me.country}; precisa ser do Brasil.`);
    const { error } = await db.rpc("rpg_tap_save_key", { p_store: storeId, p_key: key, p_merchant: me.merchant, p_country: me.country ?? null, p_user: user.id });
    if (error) return fail(500, "save", error.message);
    return json({ ok: true, merchant_code: me.merchant, key_last4: key.slice(-4) });
  }

  // 2) Site: status da conexão
  if (action === "status") {
    const user = await userFor(req);
    if (!user) return fail(401, "auth", "Faça login na RPG.");
    const storeId = String(body.store_id ?? "");
    if (!(await userCanUseStore(user.id, storeId))) return fail(403, "forbidden", "Sem acesso a esta loja.");
    const { data: m } = await db.from("rpg_tap_merchants").select("sumup_merchant_code,key_last4,status,validated_at").eq("store_id", storeId).maybeSingle();
    const { count } = await db.from("rpg_tap_devices").select("id", { count: "exact", head: true }).eq("store_id", storeId).is("revoked_at", null);
    return json({ ok: true, connected: !!m && m.status === "active", merchant: m ?? null, devices: count ?? 0, apk_url: APK_URL });
  }

  // 3) Site (ou Rafa): gera código de 6 dígitos para parear o celular
  if (action === "pair-code") {
    const user = await userFor(req);
    const storeId = String(body.store_id ?? "");
    if (!isServer(req) && !(user && (await userCanUseStore(user.id, storeId)))) return fail(403, "forbidden", "Sem acesso a esta loja.");
    const { data: m } = await db.from("rpg_tap_merchants").select("status").eq("store_id", storeId).maybeSingle();
    if (!m || m.status !== "active") return fail(400, "not_connected", "Conecte a conta SumUp antes de parear o celular.");
    for (let i = 0; i < 5; i++) {
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
      const { error } = await db.from("rpg_tap_pair_codes").insert({
        code, store_id: storeId, created_by: user?.id ?? null, expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      });
      if (!error) return json({ ok: true, code, expires_in_s: 900, app_link: `${FN_BASE}/p/${code}`, apk_url: APK_URL });
    }
    return fail(500, "code", "Não consegui gerar o código, tente de novo.");
  }

  // 4) App: troca o código por um token do aparelho
  if (action === "pair") {
    const code = String(body.code ?? "").replace(/\D/g, "");
    const { data: pc } = await db.from("rpg_tap_pair_codes").select("*").eq("code", code).maybeSingle();
    if (!pc || pc.used_at || new Date(pc.expires_at) < new Date()) return fail(400, "code_invalid", "Código inválido ou vencido. Gere outro no site da RPG.");
    await db.from("rpg_tap_pair_codes").update({ used_at: new Date().toISOString() }).eq("code", code).is("used_at", null);
    const token = [...crypto.getRandomValues(new Uint8Array(32))].map((x) => x.toString(16).padStart(2, "0")).join("");
    const { data: dev, error } = await db.from("rpg_tap_devices").insert({
      store_id: pc.store_id, token_hash: await sha256(token), label: String(body.device_label ?? "").slice(0, 80) || null,
    }).select("id").single();
    if (error) return fail(500, "pair", error.message);
    const { data: s } = await db.from("inventory_v1_stores").select("display_name").eq("id", pc.store_id).maybeSingle();
    return json({ ok: true, device_token: token, device_id: dev.id, store_name: s?.display_name ?? "Loja" });
  }

  // 5) App: pega a chave SumUp da loja (só em memória no aparelho)
  if (action === "token") {
    const dev = await deviceFor(req);
    if (!dev) return fail(401, "device", "Celular não pareado ou desconectado. Pareie de novo.");
    const { data: key, error } = await db.rpc("rpg_tap_get_key", { p_store: dev.store_id });
    if (error || !key) return fail(400, "not_connected", "A conta SumUp desta loja não está conectada.");
    const { data: s } = await db.from("inventory_v1_stores").select("display_name").eq("id", dev.store_id).maybeSingle();
    return json({ ok: true, access_token: key, store_name: s?.display_name ?? "Loja" });
  }

  // 6) Rafa/servidor ou site: cria uma cobrança no cartão e devolve o link
  if (action === "charge-create") {
    const storeId = String(body.store_id ?? "");
    const user = await userFor(req);
    const dev = await deviceFor(req);
    const allowed = isServer(req) || (user && (await userCanUseStore(user.id, storeId))) || (dev && dev.store_id === storeId);
    if (!allowed) return fail(403, "forbidden", "Sem acesso a esta loja.");
    const amount = Math.round(Number(body.amount_cents));
    if (!Number.isFinite(amount) || amount < 100) return fail(400, "amount", "Valor mínimo R$ 1,00.");
    const { data, error } = await db.from("rpg_tap_charges").insert({
      store_id: storeId, amount_cents: amount, description: body.description ? String(body.description).slice(0, 140) : null,
      source: isServer(req) ? "rafa" : dev ? "app" : "site", requested_by_wa_id: body.wa_id ?? null, sale_id: body.sale_id ?? null,
      sale_payload: body.sale_payload ?? null,
    }).select("id, amount_cents, expires_at").single();
    if (error) return fail(500, "create", error.message);
    return json({ ok: true, charge_id: data.id, amount_cents: data.amount_cents, link: chargeLink(data.id), expires_at: data.expires_at });
  }

  // 7) App: abre uma cobrança (valor vem do servidor, nunca do link)
  if (action === "charge-get") {
    const dev = await deviceFor(req);
    if (!dev) return fail(401, "device", "Celular não pareado.");
    const { data: c } = await db.from("rpg_tap_charges").select("*").eq("id", String(body.charge_id ?? "")).maybeSingle();
    if (!c || c.store_id !== dev.store_id) return fail(404, "not_found", "Cobrança não encontrada para esta loja.");
    if (c.status === "approved") return fail(409, "already_paid", `Esta cobrança já foi paga (${brl(c.amount_cents)}).`);
    if (new Date(c.expires_at) < new Date() && c.status === "pending") {
      await db.from("rpg_tap_charges").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", c.id);
      return fail(410, "expired", "Esta cobrança venceu. Peça uma nova para a Rafa.");
    }
    return json({ ok: true, charge: { id: c.id, amount_cents: c.amount_cents, description: c.description, status: c.status } });
  }

  // 8) App: registra o resultado (cobrança da Rafa ou avulsa)
  if (action === "charge-result") {
    const dev = await deviceFor(req);
    if (!dev) return fail(401, "device", "Celular não pareado.");
    const status = String(body.status ?? "");
    if (!["processing", "approved", "failed", "declined", "canceled", "unknown"].includes(status)) return fail(400, "status", "status inválido");
    const patch: Record<string, unknown> = {
      status, card_mode: body.card_mode ?? null, instalments: body.instalments ?? null,
      sumup_tx_code: body.tx_code ?? null, sumup_server_tx_id: body.server_tx_id ?? null,
      card_scheme: body.card_scheme ?? null, card_last4: body.card_last4 ?? null,
      error_code: body.error_code ?? null, error_message: body.error_message ? String(body.error_message).slice(0, 500) : null,
      device_id: dev.id, updated_at: new Date().toISOString(),
      completed_at: status === "processing" ? null : new Date().toISOString(),
    };
    let row: any;
    if (body.charge_id) {
      const { data, error } = await db.from("rpg_tap_charges").update(patch).eq("id", body.charge_id).eq("store_id", dev.store_id).select("*").maybeSingle();
      if (error || !data) return fail(404, "not_found", "Cobrança não encontrada.");
      row = data;
    } else {
      const amount = Math.round(Number(body.amount_cents));
      if (!(amount > 0)) return fail(400, "amount", "amount_cents obrigatório para cobrança avulsa");
      const { data, error } = await db.from("rpg_tap_charges").insert({ ...patch, store_id: dev.store_id, amount_cents: amount, source: "app" }).select("*").single();
      if (error) return fail(500, "insert", error.message);
      row = data;
    }
    let inventoryResult: any = null;
    if (status === "approved") inventoryResult = await finalizeInventorySale(row);

    if (row.source === "rafa" && status === "approved" && inventoryResult?.ok !== false) {
      const jti = row.sale_payload?.jti;
      if (typeof jti === "string" && jti) {
        await db.from("wa_links").update({
          revoked_at: new Date().toISOString(),
          revoked_reason: "finished",
        }).eq("code", jti).is("revoked_at", null);
      }
      if (row.requested_by_wa_id) {
        const now = new Date().toISOString();
        await db.from("whatsapp_sessions").update({
          fluxo_atual: null,
          etapa: "menu",
          payload: {},
          updated_at: now,
          expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
        }).eq("wa_id", row.requested_by_wa_id);
      }
    }

    if (row.source === "rafa" && status !== "processing") {
      const modo = row.card_mode === "credito" ? (row.instalments > 1 ? `Crédito ${row.instalments}x` : "Crédito à vista") : "Débito";
      const msg = status === "approved"
        ? inventoryResult?.ok === false
          ? `✅ Pagamento aprovado no cartão\n${brl(row.amount_cents)} · ${modo}\n⚠️ A venda foi aprovada, mas o estoque ainda não sincronizou. Não cobre de novo.`
          : `✅ Pagamento aprovado no cartão\n${brl(row.amount_cents)} · ${modo}${row.card_scheme ? ` · ${String(row.card_scheme).toUpperCase()} final ${row.card_last4 ?? ""}` : ""}\nVenda registrada e estoque atualizado.`
        : `❌ O pagamento de ${brl(row.amount_cents)} no cartão não passou${row.error_message ? `: ${row.error_message}` : "."}\nQuer tentar de novo ou cobrar no Pix?`;
      await notifyStore(row.store_id, msg, `rpg-tap:${row.id}:${status}`);
    }
    return json({ ok: true, charge_id: row.id, status: row.status, inventory: inventoryResult, return_url: RAFA_WHATSAPP_URL });
  }

  return fail(400, "action", "Ação desconhecida");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const path = new URL(req.url).pathname.replace(/^.*\/rpg-tap/, "");

  // Link do WhatsApp → abre o app direto na cobrança (fallback: baixar o app)
  const m = path.match(/^\/(c|p)\/([A-Za-z0-9-]{6,40})$/);
  if (req.method === "GET" && m) {
    const kind = m[1] === "c" ? "charge" : "pair";
    const intent = `intent://${kind}/${m[2]}#Intent;scheme=rpgcobra;package=${APP_PACKAGE};S.return_url=${encodeURIComponent(RAFA_WHATSAPP_URL)};S.browser_fallback_url=${encodeURIComponent(APK_URL)};end`;
    return new Response(null, { status: 302, headers: { Location: intent, "Cache-Control": "no-store" } });
  }
  if (req.method === "GET" && (path === "/app" || path === "/app/")) {
    return new Response(null, { status: 302, headers: { Location: APK_URL } });
  }
  if (req.method !== "POST") return fail(405, "method", "Use POST");
  let body: any = {};
  try { body = await req.json(); } catch { return fail(400, "json", "JSON inválido"); }
  try { return await handle(req, body); }
  catch (e) { console.error(e); return fail(500, "internal", String((e as Error)?.message ?? e)); }
});
