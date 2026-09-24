# Evolution (WhatsApp) — VM da Rafa

- Imagem: Evolution API **v2.3.7** (digest fixado) + **Baileys 7.0.0-rc14 com a correção de pareamento**
  (`companion_reg_refresh`, WhiskeySockets/Baileys PR #2765, commit `4f263f0e`), empacotado em
  `baileys-rc14-pairfix.tgz` (lib + WAProto + dependências de produção).
- Por que não 2.4: a imagem `homolog` (2.4, Prisma 7) quebrava a criação de instância
  (`PrismaClientValidationError` em `instance.create`). Reavaliar quando sair 2.4 estável.
- Setup: `sudo DOMAIN=... VERCEL_URL=https://www.rpgcapital.com.br bash setup.sh`
- Segredos ficam só em `/opt/rafa/.env` na VM (gerados no setup).
