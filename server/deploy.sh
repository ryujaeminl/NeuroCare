#!/bin/bash
# GPU 서버(rookie)에서 실행: git pull한 최신 코드로 이미지를 다시 빌드하고
# systemd 서비스로 등록/재시작한다. SSH/VSCode 세션이 끊겨도 서버는 systemd가
# 계속 띄워둔다(Restart=always, WantedBy=multi-user.target로 재부팅 후에도 자동 시작).
set -euo pipefail
cd "$(dirname "$0")"

echo "==> git pull"
git pull

echo "==> Docker 이미지 빌드 (neurocare-stt-image)"
docker build -t neurocare-stt-image .

echo "==> systemd 서비스 등록"
sudo cp neurocare-stt.service /etc/systemd/system/neurocare-stt.service
sudo systemctl daemon-reload
sudo systemctl enable neurocare-stt
sudo systemctl restart neurocare-stt

sleep 2
echo "==> 상태 확인"
sudo systemctl status neurocare-stt --no-pager -l | head -n 15
echo ""
echo "로그 실시간 보기: sudo journalctl -u neurocare-stt -f"
