#!/usr/bin/env bash
# Sube `data/` al bucket de R2 que sirve al sitio.
#
# Por qué existe (ADR-004 y docs/DESPLIEGUE.md): Cloudflare Pages da 500 compilaciones al
# mes en el plan gratuito. Si los datos viajaran dentro del sitio, cada corrida del cron
# gastaría una — 600 a 1.500 al mes en emergencia activa — y los despliegues se detendrían
# justo cuando los datos importan. Sirviéndolos desde R2, actualizar datos cuesta cero
# compilaciones, y el egreso de R2 no tiene cargo.
#
# Uso:  bash scripts/upload-r2.sh [bucket]
# Requiere: CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID en el entorno.
set -euo pipefail

BUCKET="${1:-${R2_BUCKET:-report-cali-datos}}"
DATA_DIR="${DATA_DIR:-data}"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "· Sin credenciales de Cloudflare; no se sube nada."
  echo "  (Configura CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID para habilitarlo.)"
  exit 0
fi

if [ ! -d "$DATA_DIR" ]; then
  echo "✗ No existe $DATA_DIR/"
  exit 1
fi

# La caché es lo que mantiene el costo en cero: casi ninguna petición llega a R2 porque
# el CDN las sirve desde el borde. `stale-while-revalidate` hace que el usuario reciba el
# dato al instante y el refresco ocurra por detrás — nadie espera.
cache_control_for() {
  case "$1" in
    # La geometría municipal prácticamente no cambia. No la marcamos `immutable` porque
    # el nombre del archivo no lleva hash de contenido: si algún día cambia, un
    # `immutable` de un año dejaría a la gente con el mapa viejo hasta 2027.
    boundaries/*) echo 'public, max-age=86400, stale-while-revalidate=604800' ;;
    *)            echo 'public, max-age=300, stale-while-revalidate=3600' ;;
  esac
}

subidos=0

while IFS= read -r archivo; do
  clave="${archivo#"$DATA_DIR"/}"

  npx --yes wrangler@latest r2 object put "$BUCKET/$clave" \
    --file "$archivo" \
    --content-type 'application/json' \
    --cache-control "$(cache_control_for "$clave")" \
    --remote >/dev/null

  echo "  ↑ $clave"
  subidos=$((subidos + 1))
done < <(find "$DATA_DIR" -type f \( -name '*.json' -o -name '*.geojson' -o -name '*.topojson' \) | sort)

echo "✓ $subidos archivos subidos a r2://$BUCKET"
