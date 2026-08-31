# proto-mail

A read-only web mail reader. A worker dumps real mail as `.eml` files (on disk, or into Cloudflare R2). This app is the room you sit in to browse, search, filter, and read them — HTML or plain text, attachments included.

There is no compose, no SMTP, no accounts. Open the mailbox and read.

## Run it

```bash
npm install
npm run dev
```

Then open [http://127.0.0.1:43217](http://127.0.0.1:43217). The sample corpus under `data/emails/` loads immediately — newsletters, threads, receipts, CID images, PDFs, personal notes.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on port **43217** |
| `npm run build` / `npm start` | Production build |
| `npm run corpus` | Regenerate the sample `.eml` files |
| `npm run lint` | ESLint |

## Drop in more mail

Put RFC 822 `.eml` files in `data/emails/` and refresh. The mailbox re-parses on process start (or the next request after a restart). Nested folders are not walked; files must sit directly in that directory.

A generator lives at `scripts/generate-emails.mjs` if you want to rebuild the bundled corpus.

## Cloudflare R2

The same parser can list and fetch `.eml` objects from an S3-compatible R2 bucket. Copy `.env.example` to `.env.local` and fill in the values:

| Variable | Required | Notes |
| --- | --- | --- |
| `R2_ACCOUNT_ID` | yes* | Cloudflare account id |
| `R2_ACCESS_KEY_ID` | yes* | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | yes* | R2 API token secret |
| `R2_BUCKET_NAME` | yes* | Bucket that holds `.eml` objects |
| `R2_PREFIX` | no | Only list keys under this prefix. Empty = whole bucket |
| `R2_INCLUDE_LOCAL` | no | `true` to merge the local corpus with R2. Default: R2 replaces local |

\*Required only when you want R2. If any of the four core vars are missing, proto-mail uses `data/emails/` and never talks to the network.

The S3 client is pointed at:

```
https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
```

Region is `auto`. Only objects whose keys end in `.eml` are imported.

## What you can do

- Three-pane layout: folders / list / reading pane
- Keyboard: `j` `k` move, `enter` or `o` open, `/` search, `esc` clear
- Instant search over from, to, subject, and extracted body text
- Combinable filters: date range, has attachment, from (typeahead), sender domain
- Threads grouped by `Message-ID` / `In-Reply-To` / `References`, with subject fallback
- HTML in a sandboxed iframe (scripts stripped, HTML sanitized). `cid:` images rewritten to local blob routes. Remote images blocked until you click **Load remote images**
- Plain-text view; toggle when both parts exist
- Attachments: size + type, image previews, PDF in a new tab, download everything (including raw `.eml`)
- Read / unread stored in `localStorage` only

## API

| Route | |
| --- | --- |
| `GET /api/mailbox` | Parsed index: threads, senders, domains |
| `GET /api/messages/:id` | One parsed message. `?remote=1` allows remote images |
| `GET /api/messages/:id/raw` | Original `.eml` |
| `GET /api/messages/:id/attachments/:attId` | Attachment bytes. `?inline=1` for preview |
| `GET /api/messages/:id/cid/:cid` | Inline CID part |

`:id` is URL-encoded (`local:2026-08-18-dispatch` or `r2:path/to/file`).
