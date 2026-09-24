#!/usr/bin/env bash
# Instala a stack da Rafa numa VM Ubuntu 24.04 (e2-micro / 1 GB).
# Uso (na VM, dentro da pasta com docker-compose.yml, Dockerfile, Caddyfile):
#   sudo DOMAIN=wa.exemplo.com.br VERCEL_URL=https://www.rpgcapital.com.br bash setup.sh
# Idempotente: pode rodar de novo sem perder segredos nem dados.
set -euo pipefail

DOMAIN="${DOMAIN:?defina DOMAIN}"
VERCEL_URL="${VERCEL_URL:?defina VERCEL_URL}"
APP_DIR=/opt/rafa

echo "==> swap de 4 GB (build e picos de memória)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=20 && echo 'vm.swappiness=20' > /etc/sysctl.d/99-swap.conf
fi

echo "==> Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "==> firewall local (só SSH + HTTP/HTTPS)"
apt-get install -y -qq ufw >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null && ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

echo "==> arquivos em $APP_DIR"
mkdir -p "$APP_DIR"
cp -f docker-compose.yml Dockerfile Caddyfile "$APP_DIR"/
cd "$APP_DIR"

echo "==> segredos (gerados uma vez, nunca sobrescritos)"
if [ ! -f .env ]; then
  umask 077
  cat > .env <<EOF
DOMAIN=$DOMAIN
VERCEL_URL=$VERCEL_URL
AUTHENTICATION_API_KEY=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 24)
WEBHOOK_SECRET=$(openssl rand -hex 32)
WORKER_SECRET=$(openssl rand -hex 32)
EOF
fi
chmod 600 .env
sed -i "s|^DOMAIN=.*|DOMAIN=$DOMAIN|; s|^VERCEL_URL=.*|VERCEL_URL=$VERCEL_URL|" .env

echo "==> build (Evolution + Baileys com correção de pareamento) e subida"
docker compose build --pull
docker compose up -d
docker compose ps

echo "==> worker da fila: a cada minuto chama a Vercel (retry, fallback, dreno)"
cat > /usr/local/bin/rafa-worker <<'EOF'
#!/usr/bin/env bash
set -a; . /opt/rafa/.env; set +a
curl -fsS -m 50 -X POST -H "x-rafa-worker-secret: $WORKER_SECRET" "$VERCEL_URL/api/whatsapp/evolution/worker" >/dev/null 2>&1 || true
EOF
chmod 700 /usr/local/bin/rafa-worker
echo '* * * * * root /usr/local/bin/rafa-worker' > /etc/cron.d/rafa-worker

echo "==> backup diário do Postgres (mantém 7 dias)"
mkdir -p /opt/rafa/backups
cat > /etc/cron.d/rafa-backup <<'EOF'
15 6 * * * root cd /opt/rafa && docker compose exec -T postgres pg_dump -U evolution evolution | gzip > /opt/rafa/backups/evolution-$(date +\%F).sql.gz && find /opt/rafa/backups -name '*.sql.gz' -mtime +7 -delete
EOF

echo "==> pronto. Teste: curl -sI https://$DOMAIN"
