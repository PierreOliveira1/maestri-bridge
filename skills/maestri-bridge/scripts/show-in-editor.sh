#!/bin/sh
set -eu

usage() {
  cat >&2 <<'USAGE'
Usage: show-in-editor.sh [--new] [--from NAME] [--editor EDITOR] [--print] FILE[:LINE[-END]] [NOTE | -]

Opens FILE in the user's editor through Maestri Bridge, highlights the lines
and shows NOTE (Markdown) in a box below them. Use "-" as NOTE to read it
from standard input.

  --new            Start a new tour instead of adding to the current one.
  --from NAME      Name shown on the note. Defaults to your Maestri name.
  --editor EDITOR  vscode (default), vscode-insiders, cursor, windsurf or vscodium.
                   Also read from MAESTRI_BRIDGE_EDITOR.
  --print          Print the link instead of opening it.
USAGE
  exit 2
}

encode() {
  if command -v perl >/dev/null 2>&1; then
    perl -e 'print join "", map { /[A-Za-z0-9._~-]/ ? $_ : sprintf("%%%02X", ord) } split //, $ARGV[0]' -- "$1"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""), end="")' "$1"
  elif command -v node >/dev/null 2>&1; then
    node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$1"
  else
    echo "show-in-editor.sh: needs perl, python3 or node to encode the link." >&2
    exit 1
  fi
}

open_link() {
  case "$(uname -s)" in
    Darwin) open "$1" ;;
    MINGW* | MSYS* | CYGWIN*) cmd.exe /c start "" "$1" ;;
    *)
      if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$1" >/dev/null 2>&1
      elif command -v cmd.exe >/dev/null 2>&1; then
        cmd.exe /c start "" "$1"
      else
        echo "$1"
      fi
      ;;
  esac
}

new=0
from=""
editor="${MAESTRI_BRIDGE_EDITOR:-vscode}"
print=0

while [ $# -gt 0 ]; do
  case "$1" in
    --new) new=1; shift ;;
    --from) [ $# -ge 2 ] || usage; from="$2"; shift 2 ;;
    --editor) [ $# -ge 2 ] || usage; editor="$2"; shift 2 ;;
    --print) print=1; shift ;;
    -h | --help) usage ;;
    --) shift; break ;;
    -?*) usage ;;
    *) break ;;
  esac
done

[ $# -ge 1 ] || usage

case "$editor" in
  vscode | vscode-insiders | cursor | windsurf | vscodium) ;;
  *) echo "show-in-editor.sh: unknown editor \"$editor\"." >&2; exit 2 ;;
esac

target="$1"
note="${2:-}"
if [ "$note" = "-" ]; then
  note="$(cat)"
fi

file="$target"
lines=""
case "$target" in
  *:*)
    suffix="${target##*:}"
    if printf '%s' "$suffix" | grep -Eq '^[0-9]+(-[0-9]+)?$'; then
      file="${target%:*}"
      lines="$suffix"
    fi
    ;;
esac

case "$file" in
  /*) ;;
  *) file="$(pwd)/$file" ;;
esac

if [ ! -e "$file" ]; then
  echo "show-in-editor.sh: $file does not exist." >&2
  exit 1
fi

query="file=$(encode "$file")"
[ -n "$lines" ] && query="$query&lines=$lines"
[ -n "$note" ] && query="$query&text=$(encode "$note")"
[ -n "${MAESTRI_TERMINAL_ID:-}" ] && query="$query&agent=$(encode "$MAESTRI_TERMINAL_ID")"
[ -n "$from" ] && query="$query&from=$(encode "$from")"
[ "$new" -eq 1 ] && query="$query&new=1"

link="$editor://maestri-bridge.maestri-bridge/show?$query"

if [ "$print" -eq 1 ]; then
  echo "$link"
else
  open_link "$link"
fi
