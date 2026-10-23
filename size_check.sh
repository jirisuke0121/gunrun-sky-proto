#!/bin/sh
# ゲーム本体（index.html・enhancements.js・assets/）の容量を、公開先の制限と比べて表示する。
# 使い方: ./size_check.sh [dev|root]   （省略時は両方）
cd "$(dirname "$0")"
mb() { awk -v b="$1" 'BEGIN{printf "%.2f", b/1048576}'; }
pct() { awk -v a="$1" -v l="$2" 'BEGIN{printf "%.0f", a/l*100}'; }
check() {
  label="$1"; dir="$2"
  [ -f "$dir/index.html" ] || return
  raw=$(( $(stat -c%s "$dir/index.html") + $(stat -c%s "$dir/enhancements.js") + $(du -sb "$dir/assets" | cut -f1) ))
  gz=$( (cat "$dir/index.html" "$dir/enhancements.js" "$dir"/assets/*) | gzip -9 | wc -c)
  files=$(( 2 + $(ls "$dir/assets" | wc -l) ))
  echo "■ $label ($dir)"
  echo "  合計 $(mb $raw) MB（圧縮後の目安 $(mb $gz) MB）／ ファイル数 $files"
  echo "  内訳: index.html $(mb $(stat -c%s "$dir/index.html")) MB / enhancements.js $(mb $(stat -c%s "$dir/enhancements.js")) MB / assets $(mb $(du -sb "$dir/assets" | cut -f1)) MB"
  echo "  CrazyGames 初回ダウンロード 50MB以内  : $(pct $raw 52428800)% 使用（残り $(mb $((52428800-raw))) MB）"
  echo "  CrazyGames スマホのトップ掲載 20MB以内: $(pct $raw 20971520)% 使用（残り $(mb $((20971520-raw))) MB）"
  echo "  CrazyGames 全体 250MB／1500ファイル   : $(pct $raw 262144000)% ／ $(pct $files 1500)%"
}
case "$1" in
  dev) check "dev版" dev ;;
  root) check "公開版" . ;;
  *) check "公開版" .; check "dev版" dev ;;
esac
echo "  ※ Y8 は容量の上限を公式ページで確認できていません（提出画面で確認）。"
echo "  ※ CrazyGames の測り方: SDK組み込み時は『ゲーム開始』までのダウンロード量。SDK未組み込みなら全体の合計。"
