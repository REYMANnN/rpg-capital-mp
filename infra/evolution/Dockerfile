# Evolution API v2.3.7 (estável, fixada por digest)
# + Baileys 7.0.0-rc14 com a correção de pareamento companion_reg_refresh
#   (WhiskeySockets/Baileys PR #2765, commit 4f263f0e), empacotado com as
#   dependências de produção dentro de node_modules/baileys.
# Motivo: desde ~28/07/2026 o QR falha em todas as versões publicadas da Evolution.
# A 2.4 (homolog) foi descartada: quebrava a criação de instância (PrismaClientValidationError).
FROM evoapicloud/evolution-api@sha256:456b4104b0ddffbb092d6b3c0560a4ae86fc3e014e885b882aca4b1b371dfc81
RUN rm -rf /evolution/node_modules/baileys
ADD baileys-rc14-pairfix.tgz /evolution/node_modules/
RUN node --input-type=module -e "const b = await import('/evolution/node_modules/baileys/lib/index.js'); if (typeof b.makeWASocket !== 'function') process.exit(1); console.log('baileys ok')"
