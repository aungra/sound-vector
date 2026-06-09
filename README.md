# MUSIC MEMORY FITTING ROOM

「Tシャツを試着する前に、音楽の記憶を試着する」参加型Tシャツ展示アプリです。

## Routes

- `/` - 受付QRから入る来場者スマホ画面
- `/works/[id]` - 作品詳細、プレイリスト、共鳴送信
- `/screen` - 会場スクリーン
- `/admin` - 出展者、Tシャツ、プレイリスト、タグ、ZINE用書き出し

## No Terminal

Finderから開く場合は、次のどちらかをダブルクリックしてください。

- `Open MUSIC MEMORY FITTING ROOM.app`
- `MUSIC MEMORY FITTING ROOM.html`

この単体HTML版はブラウザだけで動きます。来場者回答、作品推薦、共鳴、スクリーン表示、管理JSON編集、ZINE用JSON書き出しは `localStorage` に保存されます。

## iPhone Offline Check

Wi-Fiを使わずにiPhone実機で確認する場合は、`MUSIC MEMORY FITTING ROOM.html` だけをiPhoneへ送って開いてください。

現在のTシャツダミーデザインはHTML内にも埋め込んでいるため、`images` フォルダがなくても表示されます。

注意点:

- Typekitフォントはオフラインでは読み込まれません。表示確認はできますが、完全なフォント確認は通信ありで行ってください。
- iPhoneだけで開いた場合、保存データはそのiPhoneのブラウザ内に保存されます。
- Mac側の保存データとは共有されません。

## T-shirt Images

Tシャツデザイン画像は `images` フォルダに入れてください。
現在のダミーデザインは、シルクスクリーンで再現しやすいようにベタ面と太線だけで作ったSVGです。

```text
MUSICTee/
  MUSIC MEMORY FITTING ROOM.html
  images/
    t-01.svg
    t-02.svg
    t-03.svg
```

Admin画面のTシャツJSONでは、各作品に次のように指定します。

```json
"image": "images/t-01.svg"
```

画像が見つからない場合は、作品タイトル入りの仮ビジュアルが表示されます。

## Development

```bash
npm install
npm run dev
```

The app is currently backed by local demo data and `localStorage`.
For a Supabase version, replace the read/write functions in `lib/store.ts` with Supabase queries while keeping the same exported function names.

## Data

- Creators and T-shirts are seeded in `lib/seed.ts`.
- Each seeded T-shirt includes 10 tracks.
- Visitor sessions and resonances are anonymous.
- `/admin` can export the archive as JSON and resonance logs as CSV for ZINE production.
