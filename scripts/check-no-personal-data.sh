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

found=0
for pattern in "${PATTERNS[@]}"; do
  if matches=$(grep -rEil "$pattern" "$DATA_DIR" 2>/dev/null); then
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
