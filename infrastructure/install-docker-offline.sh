#!/usr/bin/env bash
set -euo pipefail
# Official static Engine and Compose releases transferred from a connected machine.
[[ "$(id -u)" = 0 && "$(uname -m)" = x86_64 ]] || { echo 'Requires root on x86_64 Linux'; exit 1; }
bundle=${1:?Usage: install-docker-offline.sh /absolute/installer-directory}
[[ "$bundle" = /* ]] || exit 1
if command -v docker >/dev/null; then echo 'Docker already exists; refusing to replace it'; exit 1; fi
command -v iptables >/dev/null
(cd "$bundle" && sha256sum -c docker-compose-linux-x86_64.sha256)
install -d -m 755 /opt/scale-lab-tools
target=/opt/scale-lab-tools/docker-28.3.2
[[ ! -e "$target" ]] || { echo 'Installation directory exists'; exit 1; }
mkdir "$target"
tar -xzf "$bundle/docker-28.3.2.tgz" -C "$target" --strip-components=1
install -m 755 "$target/docker" /usr/local/bin/docker
install -d -m 755 /usr/local/lib/docker/cli-plugins
install -m 755 "$bundle/docker-compose-linux-x86_64" /usr/local/lib/docker/cli-plugins/docker-compose
[[ ! -e /etc/systemd/system/docker.service ]] || { echo 'Docker service exists; refusing overwrite'; exit 1; }
cat > /etc/systemd/system/docker.service <<'UNIT'
[Unit]
Description=Docker Engine for server applications
After=network-online.target
Wants=network-online.target
[Service]
Type=notify
Environment=PATH=/opt/scale-lab-tools/docker-28.3.2:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/opt/scale-lab-tools/docker-28.3.2/dockerd --host=unix:///var/run/docker.sock
Restart=on-failure
RestartSec=3
TimeoutStartSec=0
Delegate=yes
KillMode=process
LimitNOFILE=infinity
LimitNPROC=infinity
TasksMax=infinity
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now docker
docker version --format '{{.Server.Version}}'
docker compose version
