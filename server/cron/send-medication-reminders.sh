#!/bin/bash
# GPU 서버(rookie)의 crontab에 등록해서 5~15분마다 실행한다. Vercel Hobby 플랜은
# Cron Jobs가 하루 1회로 제한돼 있어(https://vercel.com/docs/cron-jobs) 하루 여러 번
# 확인해야 하는 복약 알림엔 못 쓴다 - 이미 상시 구동 중인 이 GPU 서버를 재사용한다.
#
# 등록: crontab -e 로 다음 줄 추가 (경로는 실제 클론 위치에 맞게):
#   */10 * * * * /home/tta/Neurocare/server/cron/send-medication-reminders.sh >> /home/tta/Neurocare/server/cron/reminders.log 2>&1
#
# .cron_secret 파일(같은 디렉터리, git에는 안 올라감)에 Vercel의 CRON_SECRET과
# 동일한 값을 한 줄로 넣어둬야 한다.
set -euo pipefail
cd "$(dirname "$0")"

SECRET_FILE=".cron_secret"
if [ ! -f "$SECRET_FILE" ]; then
  echo "$(date -u +%FT%TZ) .cron_secret 파일이 없습니다 - 건너뜀"
  exit 1
fi

SECRET=$(cat "$SECRET_FILE")
STATUS=$(curl -sS -o /tmp/medication-reminders-response.json -w "%{http_code}" \
  -X POST "https://neuro-care-sand.vercel.app/api/cron/medication-reminders" \
  -H "Authorization: Bearer ${SECRET}")

echo "$(date -u +%FT%TZ) status=${STATUS} $(cat /tmp/medication-reminders-response.json)"
