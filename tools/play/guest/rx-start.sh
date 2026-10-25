#!/system/bin/sh
# Re-Union X play package: starts the server INSIDE the LDPlayer 9 guest (Android 9) and prepares the guest
# for the original 4.3.1 client. Run as root by the launcher (Play.ps1), after every emulator start:
#   ld.exe -s <index> "sh /mnt/shared/Misc/data/guest/rx-start.sh <real-now ISO, UTC>"
# Shared folders of the dedicated instance: Misc = the package folder, Pictures = the player's data folder
# (save/, logs/). Settings in data/package.env (or $RX_ENV). Nothing here survives an emulator restart.
# Last line printed: «RX:READY <seconds>» or «RX:ERROR <NODE|CA|NET|SERVER|TIMEOUT> <message>».
set -u
NOW=${1:-}
PKGDIR=/mnt/shared/Misc/data
DATA=/mnt/shared/Pictures
ENVFILE=${RX_ENV:-$PKGDIR/package.env}
ROOT=/data/local/rx
USR=$ROOT/data/data/com.termux/files/usr
GAME=com.square_enix.android_googleplay.khuxww
C=/system/etc/security/cacerts
fail() { echo "RX:ERROR $1 $2"; exit 1; }

[ -f "$ENVFILE" ] || fail NODE "settings not found: $ENVFILE"
set -a; . "$ENVFILE"; set +a

# 1. Node.js runtime (unpacked again only when the package's archive changes)
TAR=$PKGDIR/guest/node.tar
STAMP=$(stat -c %s "$TAR" 2>/dev/null) || fail NODE "missing $TAR"
if [ "$(cat $ROOT/.version 2>/dev/null)" != "$STAMP" ]; then
  rm -rf $ROOT && mkdir -p $ROOT && tar xf "$TAR" -C $ROOT || fail NODE 'cannot unpack the Node.js runtime'
  echo "$STAMP" > $ROOT/.version
fi
LD_LIBRARY_PATH=$USR/lib $USR/bin/node -e 0 2>/dev/null || fail NODE 'Node.js does not run in this emulator'

# 2. our CA as a system CA (the original client ignores user CAs): tmpfs copy of the system folder
if ! grep -q " $C tmpfs" /proc/mounts; then
  rm -rf /data/local/tmp/cacerts && mkdir -p /data/local/tmp/cacerts && cp $C/* /data/local/tmp/cacerts/ \
    && mount -t tmpfs tmpfs $C && cp /data/local/tmp/cacerts/* $C/ || fail CA 'cannot prepare the system CA folder'
fi
cp $PKGDIR/server/certs/ca.crt "$C/$RX_CA_HASH.0" && chown root:root $C/* && chmod 644 $C/* \
  && chcon u:object_r:system_file:s0 $C/* || fail CA 'cannot install the CA'

# 3. clock before 29/6/2021 (later the client shows «End of Service» and never connects)
settings put global auto_time 0; settings put global auto_time_zone 0
date 051512002021.00 >/dev/null

# 4. network: the game's TCP 80/443 and every DNS query except root's go to the server on the guest's own
#    address (not 127.0.0.1: Android's policy routing drops those packets); DNS-over-TLS off and port 853 shut
UID_=$(stat -c %u /data/data/$GAME 2>/dev/null) || fail NET 'the game is not installed'
IP=$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p')
[ -n "$IP" ] || fail NET 'the emulator has no network'
settings put global private_dns_mode off
iptables -t nat -N RX_NAT 2>/dev/null; iptables -t nat -F RX_NAT
iptables -t nat -C OUTPUT -j RX_NAT 2>/dev/null || iptables -t nat -A OUTPUT -j RX_NAT
for p in 80 443; do iptables -t nat -A RX_NAT -p tcp -m owner --uid-owner $UID_ --dport $p -j DNAT --to-destination $IP:$p; done
for p in udp tcp; do iptables -t nat -A RX_NAT -p $p --dport 53 -m owner ! --uid-owner 0 -j DNAT --to-destination $IP:53; done
iptables -C OUTPUT -p tcp --dport 853 -j REJECT 2>/dev/null || iptables -I OUTPUT -p tcp --dport 853 -j REJECT

# 5. server (a previous one is stopped first); first start: the package's start save
pkill -f "$USR/bin/node" 2>/dev/null; sleep 1
mkdir -p $DATA/save $DATA/logs
[ -f $DATA/save/player.json ] || cp $PKGDIR/start-save.json $DATA/save/player.json
LOG=$DATA/logs/server.log
export LD_LIBRARY_PATH=$USR/lib KHUX_PUBLIC_URL=https://127.0.0.1 KHUX_SAVE=$DATA/save/player.json
export KHUX_RESOURCE_DIR=$PKGDIR/resources KHUX_REAL_NOW=$NOW KHUX_PYTHON=/nonexistent
[ -n "$NOW" ] || unset KHUX_REAL_NOW
nohup $USR/bin/node $PKGDIR/server/server.js > $LOG 2>&1 &
PID=$!
i=0
while [ $i -lt 180 ]; do
  grep -q 'https://0.0.0.0:443' $LOG 2>/dev/null && { echo "RX:READY $i"; exit 0; }
  kill -0 $PID 2>/dev/null || fail SERVER "the server stopped, see logs/server.log: $(tail -n 1 $LOG)"
  sleep 1; i=$((i+1))
done
fail TIMEOUT 'the server did not start in 180 s, see logs/server.log'
