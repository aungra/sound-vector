# SOUND VECTOR Layer SVGs

Illustrator作業用に、各パーツを単体SVGとして分けたフォルダです。  
SVG内のグループはIllustrator上で本当のレイヤーにならない場合があるため、ここでは「1ファイル = 1レイヤー」として扱います。

## Illustratorでの配置手順

1. Illustratorで新規ドキュメントを作る。
2. 下記10ファイルと同じ名前のレイヤーを作る。
3. 各SVGを `ファイル > 配置`、またはコピー&ペーストで対応するレイヤーへ置く。
4. `01-print_area` をロックする。
5. `02-axis_structure` は非表示にする。
6. `10-pcm_reversible_data` はロックまたは非表示にする。
7. それ以外のレイヤーを下絵として描き直す。

## Files

- `01-print_area.svg`  
  印刷範囲と中心ガイド。配置後にロックする。

- `02-axis_structure.svg`  
  X/Y/Z/Time/r/theta/phi/Chroma の固定軸。アプリへ戻す図案では非表示にする。

- `03-pcm_carriers.svg`  
  見た目用PCMキャリア線。自由に崩してよい。復元音は `10-pcm_reversible_data.svg` が担当する。

- `04-waveform_guides.svg`  
  波形ガイド。線の表情、密度、間隔を描き直す。

- `05-spectral_guides.svg`  
  周波数バーコードガイド。縦線や帯の表情を描き直す。

- `06-chroma_guides.svg`  
  12音方向の放射線ガイド。

- `07-onset_tempo_guides.svg`  
  打点、テンポ、外周刻みのガイド。

- `08-reference_point.svg`  
  参照点と中心図形。

- `09-notes_for_designer.svg`  
  作業メモ。最終図案では非表示または削除する。

- `10-pcm_reversible_data.svg`  
  復元用PCMデータの保護レイヤー。実際の曲から書き出した可逆SVGでは、このレイヤーに音の復元情報が入る。編集、削除、拡大縮小、回転をしない。
