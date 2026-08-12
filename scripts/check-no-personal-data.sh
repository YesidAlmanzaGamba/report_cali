#!/usr/bin/env bash
# Barrera automática de ADR-001 (docs/DECISIONS.md).
#
# Ningún dato personal de personas desaparecidas o fallecidas puede entrar a data/.
# Esta regla no se puede dejar solo en la revisión humana: un PR bien intencionado
# con un CSV pegado adentro es exactamente el modo de falla que queremos evitar.
#
# Uso: bash scripts/check-no-personal-data.sh
set -uo pipefail

DATA_DIR="${1:-data}"

if [ ! -d "$DATA_DIR" ]; then
  echo "· $DATA_DIR/ no existe todavía; nada que verificar."
  exit 0
fi

# Campos que delatan un registro por persona. Buscamos NOMBRES DE CAMPO en JSON,
# no palabras sueltas, para no marcar como falso positivo un municipio que
# legítimamente se llama "Nombre de Jesús" o un campo "nombre" de municipio.
PATTERNS=(
  '"(primer_)?apellido'
  '"cedula'
  '"documento_identidad'
  '"num(ero)?_documento'
  '"fecha_nacimiento'
  '"telefono'
  '"celular'
  '"correo'
  '"email'
  '"desaparecid'
  '"fallecido_nombre'
  '"victima_nombre'
)

# ── Excepciones ──────────────────────────────────────────────────────────────
#
# Una sola, y acotada a un archivo: `"telefono` dentro de data/ayuda/.
#
# ADR-001 protege a PERSONAS desaparecidas o fallecidas. El teléfono de un centro
# de acopio no es eso: es el conmutador de una institución, publicado por un medio
# o por una alcaldía para que la gente llame. `curated/ayuda.json` solo admite
# instituciones, y su regla dice que el número entra únicamente si la fuente
# oficial lo publicó — nunca deducido ni buscado aparte.
#
# La excepción se acota al archivo, no al patrón: `"telefono` en cualquier otro
# lugar de data/ sigue tumbando la verificación. Y se escribe aquí, con su razón,
# en vez de ampliar la regla: una barrera que estorba en un caso legítimo termina
# desactivada entera, y eso sí sería perder ADR-001.
excepcion_de() {
  case "$1" in
    '"telefono') printf '%s' "^${DATA_DIR}/ayuda/" ;;
    *) printf '' ;;
  esac
}

found=0
for pattern in "${PATTERNS[@]}"; do
  if matches=$(grep -rEil "$pattern" "$DATA_DIR" 2>/dev/null); then
    excepcion=$(excepcion_de "$pattern")
    if [ -n "$excepcion" ]; then
      matches=$(printf '%s\n' "$matches" | grep -Ev "$excepcion" || true)
    fi
    if [ -n "$matches" ]; then
      echo "✗ Posible dato personal — patrón '$pattern' encontrado en:"
      echo "$matches" | sed 's/^/    /'
      found=1
    fi
  fi
done

if [ "$found" -ne 0 ]; then
  cat <<'EOF'

──────────────────────────────────────────────────────────────────────
ADR-001: este proyecto no almacena datos personales de personas
desaparecidas ni fallecidas. Publicamos conteos agregados por municipio.

Si necesitas este dato para una función nueva, abre un issue primero.
No lo agregues saltándote esta verificación.

Contexto completo: docs/DECISIONS.md
──────────────────────────────────────────────────────────────────────
EOF
  exit 1
fi

echo "✓ Sin datos personales en $DATA_DIR/"
