import { readFileSync, writeFileSync } from 'node:fs'

function replaceOnce(path, before, after) {
  const source = readFileSync(path, 'utf8')
  const first = source.indexOf(before)
  if (first < 0) throw new Error(`${path}: anchor not found`)
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${path}: anchor is not unique`)
  writeFileSync(path, source.slice(0, first) + after + source.slice(first + before.length))
}

replaceOnce(
  'lib/rafa-agent.ts',
  "      const sent = await sendText(input.waId, withReminder, { inReplyTo: input.inReplyTo })",
  "      const sent = await sendText(input.waId, withReminder, { inReplyTo: input.inReplyTo, pixReminderStoreId: input.storeId })",
)

replaceOnce(
  'lib/rafa-brain.ts',
  `  const reply = async (body: string, noMenu = false) => {\n    const sent = await sendText(input.waId, body, { inReplyTo: input.wamid, noMenu })\n    if (!sent.ok) throw new Error(sent.error)\n  }`,
  `  const reply = async (body: string, noMenu = false, allowPixReminder = false) => {\n    const sent = await sendText(input.waId, body, {\n      inReplyTo: input.wamid,\n      noMenu,\n      ...(allowPixReminder ? { pixReminderStoreId: input.storeId } : {}),\n    })\n    if (!sent.ok) throw new Error(sent.error)\n  }`,
)

replaceOnce(
  'lib/rafa-brain.ts',
  "      await reply(reminder ? `${withTip}\\n\\n${reminder}` : withTip)",
  "      await reply(reminder ? `${withTip}\\n\\n${reminder}` : withTip, false, true)",
)

replaceOnce(
  'lib/whatsapp-inbound.ts',
  "import { askStorePick, bindRafaStore, phoneStores, resolveRafaStore, runRafaAgent, STORE_PICK_PREFIX, type RafaAgentSource } from '@/lib/rafa-agent'",
  "import { askStorePick, bindRafaStore, phoneStores, resolveRafaStore, runRafaAgent, STORE_PICK_PREFIX, type RafaAgentSource } from '@/lib/rafa-agent'\nimport { parsePixSubmission, pixStatusForStore, savePixForStore } from '@/lib/rafa-pix'",
)

replaceOnce(
  'lib/whatsapp-inbound.ts',
  `    const session = await sessionFor(fromPhone)\n    const storeId = typeof session?.store_id === 'string' ? session.store_id : null\n\n    if (routing.intent === 'produto_por_ean' && storeId) {`,
  `    const session = await sessionFor(fromPhone)\n    const storeId = typeof session?.store_id === 'string' ? session.store_id : null\n\n    // Chave Pix é capturada deterministicamente antes de chamar a IA. Só entra aqui\n    // quando a pessoa claramente está ENTREGANDO uma chave, nunca por mera menção a Pix.\n    const pixSubmission = parsePixSubmission(text)\n    if (pixSubmission.status !== 'none') {\n      const pixResolved = storeId\n        ? { status: 'ok' as const, storeId }\n        : await resolveRafaStore(fromPhone).catch(() => ({ status: 'none' as const }))\n      if (pixResolved.status === 'ok') {\n        const currentPix = await pixStatusForStore(pixResolved.storeId).catch(() => null)\n        // Captura automática existe apenas enquanto a loja ainda não tem chave.\n        // Uma chave já cadastrada nunca é sobrescrita silenciosamente pelo WhatsApp.\n        if (currentPix && !currentPix.key) {\n          if (pixSubmission.status === 'ambiguous') {\n            const result = await sendText(fromPhone, 'Encontrei mais de uma possível chave Pix nessa mensagem. Me manda só uma chave por vez.', { inReplyTo: wamid, noMenu: true })\n            if (!result.ok) throw new Error(result.error)\n            return\n          }\n          if (pixSubmission.status === 'invalid') {\n            const result = await sendText(fromPhone, 'Não consegui validar essa chave Pix. Pode me mandar de novo? Não envie senha, token nem código do banco.', { inReplyTo: wamid, noMenu: true })\n            if (!result.ok) throw new Error(result.error)\n            return\n          }\n          const saved = await savePixForStore(pixResolved.storeId, pixSubmission.key)\n          const message = saved.status === 'saved' || saved.status === 'already_saved'\n            ? 'Perfeito. Salvei sua chave Pix. Ela será usada só para receber pagamentos da loja. Nunca me mande senha, token ou código do banco.'\n            : saved.status === 'different_key_exists'\n              ? 'Sua loja já tem uma chave Pix cadastrada. Não alterei nada.'\n              : 'Não consegui salvar sua chave Pix agora. Tente de novo em instantes.'\n          const result = await sendText(fromPhone, message, { inReplyTo: wamid, noMenu: true })\n          if (!result.ok) throw new Error(result.error)\n          return\n        }\n      }\n    }\n\n    if (routing.intent === 'produto_por_ean' && storeId) {`,
)
