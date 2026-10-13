#!/bin/sh
set -e
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/certs"
mkdir -p "$DIR"
HOST="${1:-vpn.volkula.com}"
openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
  -keyout "$DIR/key.pem" \
  -out "$DIR/cert.pem" \
  -subj "/CN=$HOST" \
  -addext "subjectAltName=DNS:$HOST,DNS:localhost,IP:127.0.0.1"
chmod 644 "$DIR/cert.pem"
chmod 600 "$DIR/key.pem"
echo "certs ready in $DIR"
