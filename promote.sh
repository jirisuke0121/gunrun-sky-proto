#!/bin/sh
# dev/ の中身を公開版（リポジトリ直下）に反映する。使い方: ./promote.sh  → 確認して git commit && git push
set -e
cd "$(dirname "$0")"
cp dev/enhancements.js enhancements.js
rm -rf assets && cp -r dev/assets assets
sed -e 's/var IM="\([^"]*\)-dev"/var IM="\1"/' -e 's#<title>【DEV】#<title>#' dev/index.html > index.html
echo "公開版に反映しました。差分を確認して commit / push してください。"
git status --short
