# SOUND VECTOR Design Format

IllustratorでTシャツ図案を描き直すための固定骨格テンプレートです。完成図案の分解ではなく、今後のデザイン制作に使う下絵フォーマットとして作っています。

## Files

- `sound-vector-format.svg`  
  実作業用テンプレート。Illustratorで開き、このSVGを下絵として線の表情、密度、太さ、余白を描き直します。

- `sound-vector-format-guide.svg`  
  説明用テンプレート。各軸が何を表すか、どこにPCMキャリアが載るかを確認できます。

- `layers/`  
  Illustratorで本当にレイヤー分けして使うための単体SVG群です。SVG内の `<g id="print_area">` はIllustratorではグループ扱いになることがあるため、ロックしたいパーツはこちらを別レイヤーに配置してください。

## Layer Rules

- `print_area`  
  Tシャツ印刷範囲、襟カーブ、中心ガイド。基本的に動かさない。

- `axis_structure`  
  X / Y / Z / Time / r / theta / phi / Chroma の固定骨格。アプリへ戻す図案では非表示にする。

- `pcm_carriers`  
  見た目用のPCMキャリア線。自由に崩してよい。復元音は別の `pcm_reversible_data` が担当する。

- `pcm_reversible_data`  
  復元用PCMを保持する保護データ。削除・変形しない。Illustratorではロックまたは非表示で保持する。

- `waveform_guides`  
  表示用波形の配置ガイド。線の揺れ方、密度、間隔は描き直してよい。

- `spectral_guides`  
  周波数帯やRMS/低域/重心のタイムライン用ガイド。

- `chroma_guides`  
  12音方向の放射線ガイド。

- `onset_tempo_guides`  
  打点、テンポ、外周刻みのガイド。

- `reference_point`  
  参照点、中心点、Lissajous風の核になる図形。

- `notes_for_designer`  
  作業メモ。入稿時は非表示または削除してください。

## Illustrator Workflow

1. Illustratorで新規ドキュメントを作る。
2. `layers/01-print_area.svg` から `layers/10-pcm_reversible_data.svg` までを、ファイル名と同じ名前のIllustratorレイヤーへ配置する。
3. `01-print_area` と `10-pcm_reversible_data` のIllustratorレイヤーをロックする。`02-axis_structure` は非表示にする。
4. `03-pcm_carriers`、`04-waveform_guides`、`05-spectral_guides`、`06-chroma_guides`、`07-onset_tempo_guides` を下絵にして描き直す。
5. 音の復元性を残す場合は `10-pcm_reversible_data` をロックまたは非表示のまま保持する。
6. 黒一色を保つ。グレー、透明度、画像埋め込みは使わない。
7. 入稿前に `09-notes_for_designer` を非表示または削除する。

## Fixed Decisions

- 画面サイズは `viewBox="0 0 1200 1200"`。
- 軸と印刷範囲は固定。
- PCMキャリアは8種類の軸を4本ずつ、合計32本。
- PCMキャリアはデザイン素材として自由に編集可能。復元音は `pcm_reversible_data` を保持する限り変化しません。
