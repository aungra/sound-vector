# Genre Theory Priors v1.1

Generated: 2026-06-21

## Purpose

音源を追加する前に、各ジャンルの音楽的特徴を分類エンジンへ弱い事前知識として入れた。

この事前知識は正解ラベルを上書きするためのものではない。実音声から得た特徴量による kNN / centroid / distribution 判定を主役にし、候補が近い場合だけ少しだけ支える。

## Implemented Files

- `genre-training/genre-theory-profiles.json`
  - 32ジャンル分の理論プロファイル。
  - tempo / onset / bass / acousticness / distortion / vocal / squareWave / breakbeat / chroma などの期待レンジを保持。
- `apps/demo/scripts/genre-training.mjs`
  - 学習・評価時に理論プロファイルを読み込む。
  - 細分類だけでなく、大分類にも弱い理論補正を追加。
- `apps/demo/MUSIC MEMORY FITTING ROOM.html`
  - ブラウザ側推定でも同じ理論補正を使う。
- `genre-training/genre-model.json`
  - `genreTheory` として理論プロファイル、参照元、係数を保持。

## Current Theory Weights

- Fine genre theory weight: `0.05`
- Macro genre theory weight: `0.035`

`0.10` も試したが、Fine Top3 は上がる一方で Fine Top1 が落ちたため不採用にした。

## Score Impact

Baseline before macro theory:

- Macro Top1: `32.8%`
- Fine Top1: `13.7%`
- Fine Top3: `25.8%`
- Needs review: `14.7%`
- Dub prediction rate: `6.2%`

After theory priors v1.1:

- Macro Top1: `32.8%`
- Fine Top1: `13.9%`
- Fine Top3: `26.0%`
- Needs review: `14.0%`
- Dub prediction rate: `6.2%`

Formal CC/local stable evaluation:

- Macro Top1: `34.5%`
- Fine Top1: `16.1%`
- Fine Top3: `29.3%`
- Needs review: `13.9%`
- Dub prediction rate: `7.1%`

## Encoded Genre Theory Examples

- Techno: 120-150 BPM, repetitive 4/4, strong beat grid, low acousticness, low vocal dependence.
- House / Deep House: 115-130 BPM house grid, bassline, possible vocals, smoother/deeper low end for deep house.
- Drum and Bass: 160-185 BPM, breakbeat density, syncopation, bass/sub-bass, half-time handling.
- Dubstep: 132-142 BPM or half-time interpretation, sub-bass, syncopated sparse rhythm.
- Dub: reggae-derived low end, darker high band, sparse onset density, space/echo-like contrast.
- Ambient / Drone: low onset density, low beat-grid reliance, sustained texture, slow chroma and RMS change.
- Rock / Punk / Metal: distortion, guitar band, mid density, onset impact, high-noise texture.
- Funk / Hip-hop / Trap: groove, bass, low-mid body, vocal/rap region, syncopation and half/double-time ambiguity.
- J-POP / Anime Song / City Pop: vocal presence, chorus lift, bright midrange, song-form stability; city pop also gets funk/disco/R&B/AOR/jazz-fusion style priors.
- Classical / Opera: acousticness, dynamic contrast, harmonic richness; opera adds strong vocal presence.
- Jazz / World / Folk / Latin: chroma complexity, acousticness, syncopation, mid-band texture.

## Findings

- 理論プロファイルは安全に少し効いたが、目標の80%にはまだ遠い。
- Techno は formal rows が103あるのに test Top1 が0%で、理論だけでは直らない。four-on-the-floor / 反復性 / kick grid をもっと直接取る特徴量が必要。
- Drone は低onset・sustainの理論を入れても blues / classical に流れる。音源ラベルか特徴量分布がまだ混ざっている可能性が高い。
- Dub は低域だけでなく、高域の暗さ、onset少なめ、空間的抜けを複合化したが、hip-hop / dubstep との混同が残る。
- City Pop / Anime Song は明示ラベル音源が不足しており、理論だけでは評価できない。

## Next Step Before More Audio

次に音源を足す前のエンジン改善としては、以下が有効。

1. Techno / House / DnB 用に kick grid, four-on-the-floor ratio, breakbeat irregularity を追加する。
2. Drone / Ambient 用に sustain ratio, long-window spectral flux, transient scarcity を追加する。
3. Dub / Reggae 用に reverb-tail proxy, bass-to-high darkness, offbeat emphasis を追加する。
4. Pop / J-POP / Anime Song 用に vocal-band stability, chorus recurrence, structure peak pattern を強める。
5. 理論プロファイルは引き続き弱い補助として使い、音源特徴量と評価セットを主判断にする。

## Theory-Matched Features v1.2

Generated: 2026-06-22

理論に対応する特徴量そのものを追加した。

追加した特徴量:

- `fourOnFloor`: onset / bass が拍頭グリッドに乗る度合い。テクノ、ハウス、ディスコ向け。
- `kickGrid`: 低域エネルギーが拍グリッドへ揃う度合い。キックの規則性を見る。
- `offbeatEmphasis`: 裏拍側のonset強度。レゲエ、ファンク、シティ・ポップ、ラテン向け。
- `breakbeatIrregularity`: breakbeat的な細かいonset密度、syncopation、非4つ打ち性。DnB向け。
- `sustainRatio`: RMSが長く続く度合い。アンビエント、ドローン、クラシック向け。
- `transientScarcity`: 立ち上がりの少なさ。ドローン、アンビエント向け。
- `reverbTail`: onset後に残るRMS尾部。ダブの空間感、残響感の近似。
- `structureRecurrence`: RMS / centroid / bass の反復構造。J-POP、アニメソング、ポップ構成向け。
- `vocalBandStability`: 中域ボーカル帯の安定性。J-POP、アニメソング、シティ・ポップ向け。

実装場所:

- `apps/demo/MUSIC MEMORY FITTING ROOM.html`
  - `genreFeatureVector()` で上記特徴量を算出。
- `apps/demo/scripts/genre-training.mjs`
  - `MMFR_ENABLE_THEORY_GENRE_FEATURES=1` の時だけ学習ベクトルへ追加。
- `genre-training/genre-theory-profiles.json`
  - Techno / House / DnB / Dub / Reggae / City Pop / J-POP / Anime Song / Ambient / Drone などへ対応付け。

評価結果:

- 新特徴量をデフォルトで直接分類ベクトルへ入れると、Fine Top3 は一時的に `27.6%` まで上がった。
- ただし Fine Top1 が `12.6%` まで下がり、needsReviewも増えた。
- そのためデフォルト採用はせず、実験フラグ `MMFR_ENABLE_THEORY_GENRE_FEATURES=1` に隔離した。
- 現在の正式モデルは安定優先で `theoryGenreFeaturesEnabled: false`。

現在の安定スコア:

- Macro Top1: `32.5%`
- Fine Top1: `13.7%`
- Fine Top3: `26.0%`
- Needs review: `13.8%`
- Dub prediction rate: `5.9%`
- Formal CC/local Fine Top3: `29.3%`

判断:

新特徴量の計算は入ったが、現データ分布ではまだ直接重みに使うとTop1を崩す。次は特徴量を追加するだけでなく、ジャンル別に「どの特徴量が本当に分離に効くか」を検定し、Techno / Dub / Drone などの弱点ジャンルだけに限定して使う必要がある。

## Externalized Training Data

内蔵ディスク圧迫を避けるため、ジャンル学習データを外付けへ移動した。

- Feature cache:
  - `/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/feature-cache.json`
- Verified dataset:
  - `/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/verified-dataset.json`
- Repo側:
  - `genre-training/cache-paths.local.json` が外付けパスを保持。
  - `genre-training/verified-dataset.json` は外付け実体へのシンボリックリンク。

今後の再学習は、音源本体や大きな特徴量キャッシュをrepo内に戻さず、外付け上のデータを読む。
