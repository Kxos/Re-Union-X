#!/usr/bin/env bash
# Genera una CA e un certificato server per il dirottamento del client.
#
#   ./server/make-cert.sh 192.168.1.50
#
# Produce in server/certs/:
#   ca.crt      -> da installare sul telefono come CA utente
#   server.key  -> chiave del server
#   server.crt  -> certificato, valido per gli host dirottati e per l'IP indicato
#
# Il SAN include psg.sqex-bridge.jp e cache.sqex-bridge.jp perche' sono gli host
# che il client contatta, piu' l'IP locale della macchina, che e' cio' che il
# telefono raggiunge davvero.

set -euo pipefail

# Git Bash converte gli argomenti che iniziano con "/" in percorsi Windows, quindi
# -subj "/CN=..." arriverebbe a OpenSSL come "C:/Program Files/Git/CN=...".
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'

LAN_IP="${1:-}"
if [[ -z "$LAN_IP" ]]; then
  echo "Uso: $0 <ip-locale-della-macchina> [inizio-validita YYMMDDHHMMSSZ]"
  echo "Trovalo con: ipconfig | grep IPv4"
  exit 1
fi

# Inizio validita' nel passato: il client va fatto girare con l'orologio a prima
# del 29/6/2021, altrimenti mostra il popup di fine servizio e non si connette.
# Un certificato emesso "oggi" sarebbe per lui non ancora valido.
START="${2:-200101000000Z}"
END="351231000000Z"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/certs"
mkdir -p "$DIR"
cd "$DIR"

# `openssl ca` e' l'unico modo, in OpenSSL 3.2, di fissare notBefore a mano.
rm -f index.txt* serial* ca.cnf
touch index.txt
echo 1000 > serial
cat > ca.cnf <<EOF
[ca]
default_ca = local
[local]
dir             = .
database        = index.txt
new_certs_dir   = .
serial          = serial
default_md      = sha256
policy          = any
unique_subject  = no
copy_extensions = none
[any]
commonName       = supplied
organizationName = optional
[v3_ca]
basicConstraints     = critical, CA:TRUE
keyUsage             = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
EOF

echo "== CA (valida da $START) =="
openssl req -new -newkey rsa:2048 -nodes -keyout ca.key -out ca.csr \
  -subj "/CN=KHUX Restoration Local CA/O=KHUX Restoration"
openssl ca -batch -notext -selfsign -config ca.cnf -keyfile ca.key \
  -in ca.csr -out ca.crt -startdate "$START" -enddate "$END" -extensions v3_ca

echo "== certificato server (IP $LAN_IP) =="
cat > san.cnf <<EOF
[req]
distinguished_name = dn
req_extensions = ext
prompt = no
[dn]
CN = psg.sqex-bridge.jp
[ext]
subjectAltName = @alt
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
[alt]
DNS.1 = psg.sqex-bridge.jp
DNS.2 = cache.sqex-bridge.jp
DNS.3 = *.sqex-bridge.jp
DNS.4 = *.kingdomhearts.com
DNS.5 = localhost
IP.1  = $LAN_IP
IP.2  = 127.0.0.1
EOF

openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr \
  -config san.cnf
openssl ca -batch -notext -config ca.cnf -cert ca.crt -keyfile ca.key \
  -in server.csr -out server.crt -startdate "$START" -enddate "$END" \
  -extfile san.cnf -extensions ext

rm -f ca.csr server.csr index.txt* serial* ca.cnf ./*.pem
openssl x509 -in server.crt -noout -subject -dates
echo
echo "fatto:"
ls -la "$DIR"
echo
echo "Prossimo passo: ca.crt va installato come CA di SISTEMA sul dispositivo di prova"
echo "(l'APK originale ignora le CA utente e non si puo' ripatchare: LIAPP lo rifiuta)."
echo "Vedi HANDOFF.md, fase B sul banco LDPlayer 9."
