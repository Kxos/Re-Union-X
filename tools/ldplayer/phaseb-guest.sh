#!/system/bin/sh
# Prepara il guest LDPlayer 9 (Android 9) per la fase B, da root:
#   ld.exe -s 0 "sh /mnt/shared/Misc/phaseb-guest.sh <ip-del-pc> [MMDDhhmmYYYY.ss]"
# (copiare prima questo file e la CA, rinominata <hash>.0, nella cartella condivisa
#  Misc: C:\Users\<utente>\Documents\XuanZhi9\Misc).
#
# Va rieseguito dopo ogni riavvio dell'istanza: nulla di quanto fa e' permanente.
#  1. CA di sistema: l'APK originale ignora le CA utente e non si puo' ripatchare
#     (LIAPP rifiuta la firma diversa con ErrorCode 90). /system e' in sola lettura,
#     quindi si sovrappone alla cartella delle CA una copia in tmpfs.
#  2. Dirottamento TCP 80/443 del solo uid del gioco verso il PC. Il nome voluto dal
#     client arriva comunque al server, nello SNI e nell'header Host.
#  3. Orologio prima del 29/6/2021: dopo quella data il client mostra il popup di
#     fine servizio, modale, e non tenta alcuna connessione.
#  4. DNS verso il PC. Il guest ha il DNS privato opportunistico attivo: netd parla
#     DNS-over-TLS (porta 853) con 8.8.8.8/8.8.4.4 e scavalca qualunque DNS in
#     chiaro. Si spegne, si chiude la 853 e si dirotta la 53 al nostro server.
set -u
IP=${1:?uso: phaseb-guest.sh <ip-del-pc> [MMDDhhmmYYYY.ss]}
WHEN=${2:-051512002021.00}
PKG=com.square_enix.android_googleplay.khuxww
C=/system/etc/security/cacerts
SH=/mnt/shared/Misc

# 1. CA
if ! grep -q " $C tmpfs" /proc/mounts; then
  rm -rf /data/local/tmp/cacerts && mkdir -p /data/local/tmp/cacerts
  cp $C/* /data/local/tmp/cacerts/
  mount -t tmpfs tmpfs $C
  cp /data/local/tmp/cacerts/* $C/
fi
for f in $SH/*.0; do [ -f "$f" ] && cp "$f" $C/; done
chown root:root $C/* && chmod 644 $C/* && chcon u:object_r:system_file:s0 $C/*
echo "CA di sistema: $(ls $C | wc -l)"

# 2. TCP del gioco verso il PC
UID_=$(stat -c %u /data/data/$PKG)
for p in 80 443; do
  while iptables -t nat -D OUTPUT -p tcp -m owner --uid-owner $UID_ --dport $p ! -d $IP -j DNAT --to-destination $IP:$p 2>/dev/null; do :; done
  iptables -t nat -A OUTPUT -p tcp -m owner --uid-owner $UID_ --dport $p ! -d $IP -j DNAT --to-destination $IP:$p
done
echo "uid del gioco $UID_: 80/443 -> $IP"

# 3. Orologio
settings put global auto_time 0
settings put global auto_time_zone 0
date $WHEN >/dev/null && echo "orologio: $(date)"

# 4. DNS
settings put global private_dns_mode off
for p in udp tcp; do
  while iptables -t nat -D OUTPUT -p $p --dport 53 ! -d $IP -j DNAT --to-destination $IP:53 2>/dev/null; do :; done
  iptables -t nat -A OUTPUT -p $p --dport 53 ! -d $IP -j DNAT --to-destination $IP:53
done
while iptables -D OUTPUT -p tcp --dport 853 -j REJECT 2>/dev/null; do :; done
iptables -I OUTPUT -p tcp --dport 853 -j REJECT
echo "DNS: privato spento, 53 -> $IP, 853 chiusa"
