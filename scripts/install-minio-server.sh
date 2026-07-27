#!/usr/bin/env bash
# 已弃用二进制安装，请使用 Docker 版：
exec "$(cd "$(dirname "$0")" && pwd)/install-minio-docker.sh" "$@"
