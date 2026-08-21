# 32 Pattern Illustrator Handoff

`editable/` の32ファイルは、Illustratorで図案を編集するための**軽量な図案SVG**です。重いPCM粒子は含めません。各ファイルはジャンルごとの固定した参照音響特徴から生成した見本で、`90_PROTECTED_PCM__PRODUCTION_ONLY` は本番でPCMを注入するための空レイヤーです。`manifest.json` は検証用の属性一覧であり、PCM本体のバックアップではありません。

今回承認した手修正を本番生成へ戻す規則と、32ジャンル別に保持する構造は [APPROVED_DESIGN_RULES_JA.md](./APPROVED_DESIGN_RULES_JA.md) に定めています。
全32点の線幅補正結果は [screenprint-stroke-audit.md](./screenprint-stroke-audit.md) で確認できます。

## レイヤー

| Illustratorレイヤー | 扱い | 内容 |
| --- | --- | --- |
| `00_BACKGROUND` | 編集可 | 背景。印刷仕様に合わせて白黒を調整できます。 |
| `10_PRIMARY_STRUCTURE` | 編集可 | ジャンルの主構造・主シルエット。 |
| `20_GENRE_OBJECT` | 編集可 | 楽器、記号、ジャンル固有のオブジェクト。 |
| `30_GENRE_BLEND_*` | 編集可 | Top2以降のジャンル成分。必要なら削除できます。 |
| `40_FAMILY_SCORE` | 編集可 | Air / Signal / Bass / Impact 系統の譜面骨格。 |
| `50_COUNCIL_COMPOSITION` | 編集可 | 余白、画面の緊張、版面構成を補助する要素。 |
| `60_DISPLAY_GRAIN` | 編集可 | 見た目用の粒子・密度。 |
| `70_VISIBLE_PCM_WAVEFORM` | 編集可 | 存在する場合は見た目用の波形キャリア。音の復元には使いません。 |
| `90_PROTECTED_PCM__PRODUCTION_ONLY` | 触らない | 軽量編集版では空です。実曲の本番SVGにだけ、可視の保護PCMが自動生成されます。 |

## Illustratorでの作業

1. `editable/` から対象のSVGをIllustratorで開きます。
2. `90 PROTECTED PCM - PRODUCTION ONLY` は空の目印です。編集や描画をせずに残します。
3. `00` から `70` のレイヤーだけを編集します。別の案を作るときは `.ai` を別名保存してください。
4. 書き出しは **SVG 1.1**、**Presentation Attributes**、**小数点以下5桁以上**、**IDを保持**、**最小化しない**で行います。
5. 図案レイヤーの編集は自由です。ラスタライズ・画像埋め込みは本番SVGに引き継がないでください。
6. 書き戻す前に、下記のプリフライトを実行します。

```bash
npm --prefix apps/demo run preflight:illustrator -- --artwork-only <Illustratorから書き出したSVG>
```

`OK ... （軽量図案。PCMは本番注入）` なら、軽量な編集版として正しい状態です。PCMの復元検証は、本番の実曲SVGをアプリから生成した後に行います。

```bash
npm --prefix apps/demo run preflight:illustrator -- --structure-only /path/to/production.svg
```

## 本番PCMのルール

本番書き出しでは、アプリが実曲のPCMから可視 `pcm_reversible_data` を生成します。生成済み本番SVGの `90_PROTECTED_PCM__LOCKED` に対して次の操作は禁止です。

- 移動、拡大縮小、回転、シアー、親グループへの変形
- 粒子の追加・削除・並べ替え、パスの単純化、アウトライン化、結合
- クリッピング、マスク、非表示、透明化、ラスタライズ
- 塗りの変更、別オブジェクトへの置換、コピーして作り直すこと
- Illustratorの「SVGを最適化」、ID削除、数値精度を下げる書き出し

保護レイヤー以外のレイヤーは削除、変形、描き直し、黒一色への再構成を行えます。そこをどれだけ編集しても、本番生成後の `pcm_reversible_data` が同じ順序・座標・粒径で可視のままなら、復元する音は変わりません。

## 戻す時のルール

1. 元の `editable/` ファイルを残し、編集版は `genre-name-v01.svg` のように別名で保存します。
2. 書き出した編集SVGに対して `--artwork-only` プリフライトを通します。
3. 本番は必ず対象の実曲をアプリで再生成して、そのSVGに `pcm_reversible_data` を注入します。軽量編集SVGだけを読み込んでも音は復元できません。
4. 本番SVGでは `90_PROTECTED_PCM__LOCKED` をロックしたままにします。内側の `id="pcm_reversible_data"`、`data-layer="pcm_reversible_data"`、`data-edit-policy="lock-do-not-edit"` を保持します。
5. 本番SVGを通常プリフライトし、アプリで読み込んで「保護PCMデータから復元音」を実聴確認します。

## 再生成

ジェネレーターの更新後に参照パッケージを作り直す場合は次を実行します。

```bash
npm --prefix apps/demo run export:illustrator-32
```

このコマンドは32件すべての軽量編集SVGを再生成します。本番の実曲SVGは、アプリから書き出す時点で可視の保護PCMを注入します。
