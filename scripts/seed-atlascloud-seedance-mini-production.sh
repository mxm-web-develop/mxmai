#!/usr/bin/env bash
# 向生产 Supabase 注册 AtlasCloud Seedance 2.0 Mini + 导入 fragment-mini 业务
# 用法: bash scripts/seed-atlascloud-seedance-mini-production.sh
#
# 说明：主服务器 .env 通常无 SUPABASE_SERVICE_KEY，provider_models 经 SSH + pg 直连写入；
# 业务 bundle 在服务器上用 tsx + anon key 导入。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-root@121.43.32.168}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/supermxmai}"
BUNDLE_REL="mxmcgi/src/tasks/examples/video-generator-fragment-mini.business.json"

log() { echo "[seed-seedance-mini] $*" ; }

ssh_cmd() {
  if [[ -n "${DEPLOY_SSH_PASS:-}" ]] && command -v sshpass >/dev/null; then
    SSHPASS="$DEPLOY_SSH_PASS" sshpass -e ssh -o StrictHostKeyChecking=accept-new "$DEPLOY_HOST" "$@"
  else
    ssh -o StrictHostKeyChecking=accept-new "$DEPLOY_HOST" "$@"
  fi
}

scp_cmd() {
  if [[ -n "${DEPLOY_SSH_PASS:-}" ]] && command -v sshpass >/dev/null; then
    SSHPASS="$DEPLOY_SSH_PASS" sshpass -e scp -o StrictHostKeyChecking=accept-new "$1" "$2"
  else
    scp -o StrictHostKeyChecking=accept-new "$1" "$2"
  fi
}

log "1/3 同步 bundle 到 ${DEPLOY_HOST}..."
scp_cmd "${ROOT}/${BUNDLE_REL}" "${DEPLOY_HOST}:${DEPLOY_PATH}/${BUNDLE_REL}"

log "2/3 写入 provider_models + provider_pricing（pg 直连）..."
ssh_cmd "cd '${DEPLOY_PATH}' && node" <<'NODE'
require('dotenv').config({ path: '.env' });
const { Client } = require('./mxmdata/node_modules/pg');

(async () => {
  const c = new Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  await c.query(
    `INSERT INTO provider_models (
      provider, scope, model_key, upstream_model,
      protocol, modality,
      display_name, description,
      capabilities, default_parameters,
      is_enabled
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6,
      $7, $8,
      $9::jsonb, $10::jsonb,
      true
    ) ON CONFLICT (provider, scope, model_key) DO UPDATE SET
      upstream_model = EXCLUDED.upstream_model,
      protocol = EXCLUDED.protocol,
      modality = EXCLUDED.modality,
      display_name = EXCLUDED.display_name,
      description = EXCLUDED.description,
      capabilities = EXCLUDED.capabilities,
      default_parameters = EXCLUDED.default_parameters,
      is_enabled = true,
      updated_at = NOW()`,
    [
      'atlascloud',
      'video',
      'bytedance/seedance-2.0-mini',
      'bytedance/seedance-2.0-mini',
      'prediction_video',
      'video',
      'Seedance 2.0 Mini',
      'AtlasCloud Seedance 2.0 Mini：文生/图生/多参考视频合一入口，经济版约标准版半价。',
      JSON.stringify({
        input: { text: true, image: true, video: true, audio: true },
        output: { video: true, audio: true },
        modes: ['text-to-video', 'image-to-video', 'reference-to-video'],
      }),
      JSON.stringify({ duration: 5, resolution: '720p', generate_audio: false }),
    ],
  );

  for (const scope of ['video', 'default']) {
    await c.query(
      `INSERT INTO provider_pricing (provider, scope, model_key, charge_mode, unit_price, currency, platform_unit_price, platform_min_charge, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (provider, scope, model_key) DO UPDATE SET
         charge_mode=EXCLUDED.charge_mode,
         unit_price=EXCLUDED.unit_price,
         currency=EXCLUDED.currency,
         platform_unit_price=EXCLUDED.platform_unit_price,
         platform_min_charge=EXCLUDED.platform_min_charge,
         updated_at=NOW()`,
      ['atlascloud', scope, 'bytedance/seedance-2.0-mini', 'per_second_video', 0.045, 'USD', 8, 8],
    );
  }

  const r = await c.query(
    'SELECT model_key, upstream_model, protocol, is_enabled FROM provider_models WHERE model_key=$1',
    ['bytedance/seedance-2.0-mini'],
  );
  console.log('provider_models:', JSON.stringify(r.rows[0]));
  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
NODE

log "3/3 导入 video/generator/fragment-mini bundle..."
ssh_cmd "cd '${DEPLOY_PATH}/mxmcgi' && set -a && source '${DEPLOY_PATH}/.env' && set +a && ../node_modules/.bin/tsx src/scripts/apply-mxm-business-bundle.ts src/tasks/examples/video-generator-fragment-mini.business.json"

log "reload mxmcgi..."
ssh_cmd "cd '${DEPLOY_PATH}' && pm2 reload mxmcgi-api mxmcgi-worker mxmcgi-scheduler 2>/dev/null || pm2 reload mxmcgi-api mxmcgi-worker"

log "完成。请刷新 Admin → Provider 管理 → 物理模型目录（scope=video），应看到 Seedance 2.0 Mini"
