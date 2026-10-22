# Stampa l'IPv4 della macchina sulla rete locale: il primo indirizzo ottenuto via
# DHCP che non sia loopback, link-local, Hyper-V (vEthernet), tunnel o VPN.
# Usato da start-server.bat; tenuto a parte per non combattere con l'escape di cmd.
Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
        $_.IPAddress -notlike '127.*' -and
        $_.IPAddress -notlike '169.254.*' -and
        $_.InterfaceAlias -notlike 'vEthernet*' -and
        $_.InterfaceAlias -notlike '*Tunnel*' -and
        $_.InterfaceAlias -notlike '*VPN*' -and
        $_.PrefixOrigin -eq 'Dhcp'
    } |
    Select-Object -First 1 -ExpandProperty IPAddress
