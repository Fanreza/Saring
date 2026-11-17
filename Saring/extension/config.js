// Alamat server Saring. Saat deploy, ganti keduanya ke domain kamu (mis. https://saring.contohdomain.com)
// dan sesuaikan "host_permissions" di manifest.json dengan domain yang sama.
const SARING_API = 'https://gateway.aethereal.top'
const SARING_WEB = 'https://saring.aethereal.top'
// Untuk pengembangan lokal (./start-dev.sh): ganti ke 'http://localhost:8787' dan 'http://localhost:5173',
// lalu ubah host_permissions di manifest.json ke "http://localhost:8787/*".
