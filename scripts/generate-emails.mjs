#!/usr/bin/env node
/**
 * Generates the local .eml corpus under data/emails/.
 * Run: node scripts/generate-emails.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, crc32 } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "emails");

mkdirSync(OUT, { recursive: true });

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function makePng(w, h, pixel) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a = 255] = pixel(x, y, w, h);
      const i = y * (w * 4 + 1) + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function makePdf(title, bodyLines) {
  const escape = (s) => s.replace(/[()\\]/g, "\\$&");
  const ops = [
    "BT",
    "/F1 20 Tf",
    "72 720 Td",
    `(${escape(title)}) Tj`,
    "/F1 11 Tf",
    "0 -28 Td",
  ];
  for (const line of bodyLines) {
    ops.push(`(${escape(line)}) Tj`, "0 -16 Td");
  }
  ops.push("ET");
  const stream = ops.join("\n");
  const objs = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];
  let offset = "%PDF-1.4\n".length;
  const xref = ["0000000000 65535 f "];
  let body = "%PDF-1.4\n";
  for (const obj of objs) {
    xref.push(String(offset).padStart(10, "0") + " 00000 n ");
    body += obj;
    offset += obj.length;
  }
  const startxref = body.length;
  body += `xref\n0 6\n${xref.join("\n")}\n`;
  body += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
  return Buffer.from(body, "utf8");
}

function encodeHeader(value) {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function wrapB64(buf) {
  const s = Buffer.isBuffer(buf) ? buf.toString("base64") : Buffer.from(buf).toString("base64");
  return s.replace(/(.{76})/g, "$1\n");
}

function qp(str) {
  return str
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      let out = "";
      for (const byte of Buffer.from(line, "utf8")) {
        if (byte === 0x3d || byte > 126 || byte < 32) {
          out += "=" + byte.toString(16).toUpperCase().padStart(2, "0");
        } else {
          out += String.fromCharCode(byte);
        }
      }
      return out;
    })
    .join("\r\n");
}

let boundaryN = 0;
function boundary(prefix = "pm") {
  boundaryN += 1;
  return `${prefix}_${boundaryN}_${Date.now().toString(36)}`;
}

function formatDate(d) {
  return d.toUTCString().replace("GMT", "+0000");
}

function buildMessage(opts) {
  const {
    from,
    to,
    cc,
    subject,
    date,
    messageId,
    inReplyTo,
    references,
    text,
    html,
    attachments = [],
    inlines = [],
  } = opts;

  const headers = [
    `From: ${from}`,
    `To: ${Array.isArray(to) ? to.join(", ") : to}`,
  ];
  if (cc) headers.push(`Cc: ${Array.isArray(cc) ? cc.join(", ") : cc}`);
  headers.push(
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${formatDate(date)}`,
    `Message-ID: <${messageId}>`,
    "MIME-Version: 1.0",
  );
  if (inReplyTo) headers.push(`In-Reply-To: <${inReplyTo}>`);
  if (references?.length) {
    headers.push(`References: ${references.map((r) => `<${r}>`).join(" ")}`);
  }

  const mixedBoundary = boundary("mixed");
  const altBoundary = boundary("alt");
  const relBoundary = boundary("rel");

  const hasAttach = attachments.length > 0;
  const hasInline = inlines.length > 0;
  const hasHtml = Boolean(html);
  const hasText = Boolean(text);

  const altParts = [];
  if (hasText) {
    altParts.push(
      `--${altBoundary}\r\nContent-Type: text/plain; charset="utf-8"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n${qp(text)}\r\n`,
    );
  }
  if (hasHtml) {
    altParts.push(
      `--${altBoundary}\r\nContent-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n${qp(html)}\r\n`,
    );
  }
  const altBody = `${altParts.join("")}--${altBoundary}--\r\n`;

  let inner;
  if (hasHtml && hasText) {
    inner = `Content-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n${altBody}`;
  } else if (hasHtml) {
    inner = `Content-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n${qp(html)}\r\n`;
  } else {
    inner = `Content-Type: text/plain; charset="utf-8"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n${qp(text || "")}\r\n`;
  }

  if (hasInline) {
    const relatedParts = [
      `--${relBoundary}\r\n${inner}`,
      ...inlines.map((inl) => {
        return `--${relBoundary}\r\nContent-Type: ${inl.contentType}\r\nContent-Transfer-Encoding: base64\r\nContent-ID: <${inl.cid}>\r\nContent-Disposition: inline; filename="${inl.filename}"\r\n\r\n${wrapB64(inl.content)}\r\n`;
      }),
      `--${relBoundary}--\r\n`,
    ];
    inner = `Content-Type: multipart/related; boundary="${relBoundary}"\r\n\r\n${relatedParts.join("")}`;
  }

  if (hasAttach) {
    const parts = [
      `--${mixedBoundary}\r\n${inner}`,
      ...attachments.map((att) => {
        return `--${mixedBoundary}\r\nContent-Type: ${att.contentType}; name="${att.filename}"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="${att.filename}"\r\n\r\n${wrapB64(att.content)}\r\n`;
      }),
      `--${mixedBoundary}--\r\n`,
    ];
    headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
    return headers.join("\r\n") + "\r\n\r\n" + parts.join("");
  }

  // inner already includes its Content-Type header
  const [firstLine, ...rest] = inner.split("\r\n");
  headers.push(firstLine);
  return headers.join("\r\n") + "\r\n" + rest.join("\r\n");
}

const logoPng = makePng(64, 64, (x, y, w, h) => {
  const cx = w / 2;
  const cy = h / 2;
  const d = Math.hypot(x - cx, y - cy);
  if (d < 26) return [212, 160, 84, 255];
  if (d < 30) return [48, 42, 32, 255];
  return [20, 18, 14, 0];
});

const studioMark = makePng(48, 48, (x, y) => {
  const on = x > 8 && x < 40 && y > 14 && y < 34;
  return on ? [240, 235, 227, 255] : [28, 24, 18, 255];
});

const photoWarm = makePng(320, 200, (x, y, w, h) => {
  const t = x / w;
  const u = y / h;
  return [Math.floor(180 + 50 * t), Math.floor(120 + 40 * u), Math.floor(80 + 20 * t), 255];
});

const photoCool = makePng(320, 200, (x, y, w, h) => {
  const t = x / w;
  return [Math.floor(40 + 30 * t), Math.floor(70 + 80 * (y / h)), Math.floor(120 + 80 * t), 255];
});

const stripePdf = makePdf("Receipt · Stripe", [
  "Hale Studio  -  Nora Hale",
  "Date: August 1, 2026",
  "Amount: $49.00 USD",
  "Description: Linear Business  -  monthly",
  "Payment: Visa 4242",
  "Receipt ID: ch_3Q8kHaleStudio01",
]);

const figmaPdf = makePdf("Invoice INV-1842", [
  "Figma, Inc.",
  "Bill to: Hale Studio",
  "Professional seat  x  3",
  "Period: 20 Mar 2026  -  20 Apr 2026",
  "Total due: $45.00",
  "Paid with Visa ending 4242",
]);

const notesTxt = Buffer.from(
  `Studio sync — 25 Aug 2026
========================

- Lock type ramp for proto-mail reading pane
- CID rewrite must not leak remote trackers
- Jordan to send motion specs by Thursday
- Open question: do we thread by subject when References is missing?

Action items
- Nora: ship the local corpus
- Maya: review empty states
`,
  "utf8",
);

const NORA = `"Nora Hale" <nora@halestudio.co>`;
const MAYA = `"Maya Chen" <maya@halestudio.co>`;
const JORDAN = `"Jordan Park" <jordan@halestudio.co>`;
const ALEX = `"Alex Rivera" <alex@halestudio.co>`;
const PRIYA = `"Priya Shah" <priya@halestudio.co>`;
const TOM = `"Tom Ellison" <tom@halestudio.co>`;
const SAM = `"Sam Okonkwo" <sam@okonkwo.studio>`;
const MOM = `"Elena Hale" <elena.hale@fastmail.com>`;

const emails = [];

function add(filename, msg) {
  emails.push({ filename, raw: buildMessage(msg) });
}

// ── Thread A: Q3 design system (5) ──────────────────────────────────────────
add("2026-03-12-design-system.eml", {
  from: MAYA,
  to: [NORA, JORDAN, ALEX],
  subject: "Q3 design system — type, color, and the reading pane",
  date: new Date("2026-03-12T16:14:00Z"),
  messageId: "ds-01@halestudio.co",
  text: `Team —

We need to lock the visual system before proto-mail leaves the studio.

Proposals:
1. Newsreader / Instrument for the wordmark, not another geometric sans.
2. Warm charcoal, ivory, a single antique gold. No purple. Ever.
3. HTML mail renders on a paper-white canvas even when the chrome is dark.

I put a first pass in Figma. Comments by Friday?

Maya
Hale Studio
`,
  html: `<div style="font-family:Georgia,serif;color:#1a1714;line-height:1.55;font-size:16px;">
  <p>Team —</p>
  <p>We need to lock the visual system before <strong>proto-mail</strong> leaves the studio.</p>
  <ol>
    <li>Newsreader / Instrument for the wordmark, not another geometric sans.</li>
    <li>Warm charcoal, ivory, a single antique gold. <em>No purple. Ever.</em></li>
    <li>HTML mail renders on a paper-white canvas even when the chrome is dark.</li>
  </ol>
  <p>I put a first pass in Figma. Comments by Friday?</p>
  <p style="color:#6b6258;">Maya<br/>Hale Studio</p>
</div>`,
});

add("2026-03-12-design-system-jordan.eml", {
  from: JORDAN,
  to: [MAYA, NORA, ALEX],
  subject: "Re: Q3 design system — type, color, and the reading pane",
  date: new Date("2026-03-12T19:41:00Z"),
  messageId: "ds-02@halestudio.co",
  inReplyTo: "ds-01@halestudio.co",
  references: ["ds-01@halestudio.co"],
  text: `Maya —

Gold on charcoal is right. I'd push the list pane 4px tighter and keep unread as a dot, not a bold-everything treatment.

Motion: 120ms ease-out on pane changes. No bounce.

— J
`,
  html: `<div style="font-family:Georgia,serif;color:#1a1714;line-height:1.55;">
  <p>Maya —</p>
  <p>Gold on charcoal is right. I'd push the list pane 4px tighter and keep unread as a <strong>dot</strong>, not a bold-everything treatment.</p>
  <p>Motion: 120ms ease-out on pane changes. No bounce.</p>
  <p>— J</p>
</div>`,
});

add("2026-03-13-design-system-alex.eml", {
  from: ALEX,
  to: [MAYA, JORDAN, NORA],
  subject: "Re: Q3 design system — type, color, and the reading pane",
  date: new Date("2026-03-13T14:02:00Z"),
  messageId: "ds-03@halestudio.co",
  inReplyTo: "ds-02@halestudio.co",
  references: ["ds-01@halestudio.co", "ds-02@halestudio.co"],
  text: `Adding a note on attachments: image previews should sit in the reading pane, not a modal. PDFs open in a new tab.

Also — please keep keyboard j/k identical to mutt. Nora will revolt otherwise.

Alex
`,
});

add("2026-03-13-design-system-maya.eml", {
  from: MAYA,
  to: [ALEX, JORDAN, NORA],
  subject: "Re: Q3 design system — type, color, and the reading pane",
  date: new Date("2026-03-13T17:28:00Z"),
  messageId: "ds-04@halestudio.co",
  inReplyTo: "ds-03@halestudio.co",
  references: ["ds-01@halestudio.co", "ds-02@halestudio.co", "ds-03@halestudio.co"],
  text: `Captured.

j/k, enter/o, slash for search, esc to clear. I'll spec the empty states this afternoon — they were looking like error pages.

Maya
`,
  html: `<div style="font-family:Georgia,serif;color:#1a1714;line-height:1.55;">
  <p>Captured.</p>
  <p><code>j/k</code>, <code>enter/o</code>, slash for search, esc to clear. I'll spec the empty states this afternoon — they were looking like error pages.</p>
  <p>Maya</p>
</div>`,
});

add("2026-03-14-design-system-jordan.eml", {
  from: JORDAN,
  to: [MAYA, ALEX, NORA],
  subject: "Re: Q3 design system — type, color, and the reading pane",
  date: new Date("2026-03-14T15:11:00Z"),
  messageId: "ds-05@halestudio.co",
  inReplyTo: "ds-04@halestudio.co",
  references: ["ds-01@halestudio.co", "ds-02@halestudio.co", "ds-03@halestudio.co", "ds-04@halestudio.co"],
  text: `Shipped the motion spec. Linked from the Figma file.

One leftover: remote images stay blocked until the reader asks. That's non-negotiable for a mail client we actually sit in.

— J
`,
});

// ── Thread B: Friday dinner (3) ─────────────────────────────────────────────
add("2026-08-21-dinner.eml", {
  from: SAM,
  to: NORA,
  subject: "Friday — oyster bar or the courtyard?",
  date: new Date("2026-08-21T22:05:00Z"),
  messageId: "dinner-01@okonkwo.studio",
  text: `Nora,

I'm in town Friday. The new oyster bar on Valencia, or the courtyard behind the bookstore if you want quiet.

Either way I want to hear how proto-mail is feeling. 7:30?

Sam
`,
});

add("2026-08-21-dinner-reply.eml", {
  from: NORA,
  to: SAM,
  subject: "Re: Friday — oyster bar or the courtyard?",
  date: new Date("2026-08-21T23:40:00Z"),
  messageId: "dinner-02@halestudio.co",
  inReplyTo: "dinner-01@okonkwo.studio",
  references: ["dinner-01@okonkwo.studio"],
  text: `Courtyard. I've been inside a reading pane for two weeks.

7:30 works. I'll take the table under the fig tree.

N
`,
});

add("2026-08-22-dinner-confirm.eml", {
  from: SAM,
  to: NORA,
  subject: "Re: Friday — oyster bar or the courtyard?",
  date: new Date("2026-08-22T14:12:00Z"),
  messageId: "dinner-03@okonkwo.studio",
  inReplyTo: "dinner-02@halestudio.co",
  references: ["dinner-01@okonkwo.studio", "dinner-02@halestudio.co"],
  text: `Booked. Fig tree. Don't bring a laptop.

Sam
`,
});

// ── Thread C: Launch recap (4) ──────────────────────────────────────────────
add("2026-06-02-launch.eml", {
  from: NORA,
  to: [MAYA, JORDAN, ALEX, PRIYA, TOM],
  subject: "v0.9 went out — recap and the holes",
  date: new Date("2026-06-02T18:00:00Z"),
  messageId: "launch-01@halestudio.co",
  text: `We shipped v0.9 to the private list at noon.

What worked: first-open time, the three-pane density, search feeling instant.

What's still a hole:
- CID images 404 on two newsletters
- Thread expand doesn't restore scroll
- PDF attachments don't show size

Please reply in-thread. I don't want a new subject for each hole.

Nora
`,
  html: `<div style="font-family:Georgia,serif;color:#1c1916;line-height:1.6;">
  <p>We shipped <strong>v0.9</strong> to the private list at noon.</p>
  <p>What worked: first-open time, the three-pane density, search feeling instant.</p>
  <p>What's still a hole:</p>
  <ul>
    <li>CID images 404 on two newsletters</li>
    <li>Thread expand doesn't restore scroll</li>
    <li>PDF attachments don't show size</li>
  </ul>
  <p>Please reply in-thread. I don't want a new subject for each hole.</p>
  <p>Nora</p>
</div>`,
});

add("2026-06-02-launch-priya.eml", {
  from: PRIYA,
  to: [NORA, MAYA, JORDAN, ALEX, TOM],
  subject: "Re: v0.9 went out — recap and the holes",
  date: new Date("2026-06-02T19:22:00Z"),
  messageId: "launch-02@halestudio.co",
  inReplyTo: "launch-01@halestudio.co",
  references: ["launch-01@halestudio.co"],
  text: `CID is on me. The rewrite was dropping angle brackets from Content-ID. Patch in review.

Priya
`,
});

add("2026-06-03-launch-tom.eml", {
  from: TOM,
  to: [NORA, PRIYA, MAYA, JORDAN, ALEX],
  subject: "Re: v0.9 went out — recap and the holes",
  date: new Date("2026-06-03T13:08:00Z"),
  messageId: "launch-03@halestudio.co",
  inReplyTo: "launch-02@halestudio.co",
  references: ["launch-01@halestudio.co", "launch-02@halestudio.co"],
  text: `PDF size is a one-liner — we weren't reading the parsed size field. Will land with Priya's CID fix.

The private list loved the gold unread dots, for whatever that's worth.

Tom
`,
});

add("2026-06-03-launch-maya.eml", {
  from: MAYA,
  to: [NORA, TOM, PRIYA, JORDAN, ALEX],
  subject: "Re: v0.9 went out — recap and the holes",
  date: new Date("2026-06-03T20:44:00Z"),
  messageId: "launch-04@halestudio.co",
  inReplyTo: "launch-03@halestudio.co",
  references: ["launch-01@halestudio.co", "launch-02@halestudio.co", "launch-03@halestudio.co"],
  text: `Thread scroll is a layout bug in the list virtualizer. I have a reproduction with the design-system thread (5 deep). Fix tomorrow morning.

Maya
`,
  html: `<div style="font-family:Georgia,serif;color:#1c1916;line-height:1.55;">
  <p>Thread scroll is a layout bug in the list virtualizer. I have a reproduction with the design-system thread (5 deep). Fix tomorrow morning.</p>
  <p>Maya</p>
</div>`,
});

// ── Stripe receipt + PDF ────────────────────────────────────────────────────
add("2026-08-01-stripe-receipt.eml", {
  from: `"Stripe" <receipts@stripe.com>`,
  to: NORA,
  subject: "Your receipt from Linear [#1842]",
  date: new Date("2026-08-01T09:04:11Z"),
  messageId: "ch_3Q8kHaleStudio01@stripe.com",
  text: `Linear Business — $49.00 USD
Paid August 1, 2026
Visa ending 4242
Receipt ID: ch_3Q8kHaleStudio01

A PDF copy of this receipt is attached.

Stripe, Inc.
`,
  html: `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f6f9fc;padding:32px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;color:#0a2540;">
    <p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#687078;">Receipt</p>
    <h1 style="font-size:28px;margin:8px 0 24px;">$49.00</h1>
    <table style="width:100%;font-size:14px;border-collapse:collapse;">
      <tr><td style="padding:8px 0;color:#687078;">Merchant</td><td style="text-align:right;">Linear</td></tr>
      <tr><td style="padding:8px 0;color:#687078;">Date</td><td style="text-align:right;">Aug 1, 2026</td></tr>
      <tr><td style="padding:8px 0;color:#687078;">Payment</td><td style="text-align:right;">Visa 4242</td></tr>
      <tr><td style="padding:8px 0;color:#687078;">Receipt</td><td style="text-align:right;">ch_3Q8kHaleStudio01</td></tr>
    </table>
    <p style="margin-top:24px;font-size:13px;color:#687078;">A PDF copy is attached.</p>
  </div>
</div>`,
  attachments: [
    { filename: "receipt-ch_3Q8kHaleStudio01.pdf", contentType: "application/pdf", content: stripePdf },
  ],
});

// ── Newsletter with CID logo ────────────────────────────────────────────────
add("2026-08-18-dispatch.eml", {
  from: `"The Studio Dispatch" <dispatch@halestudio.co>`,
  to: NORA,
  subject: "Dispatch № 42 — sitting in a mail client",
  date: new Date("2026-08-18T15:00:00Z"),
  messageId: "dispatch-42@halestudio.co",
  text: `THE STUDIO DISPATCH  № 42

Sitting in a mail client
------------------------
Most readers still render HTML like it's 2009. proto-mail treats the
reading pane as a room: paper for letters, charcoal for chrome.

This week
- CID images resolved without leaking remote trackers
- j/k navigation landed
- The courtyard dinner is Friday (leave the laptop)

Until next Tuesday.
`,
  html: `<div style="font-family:Georgia,serif;background:#f7f1e6;padding:0;margin:0;color:#1a1714;">
  <div style="max-width:560px;margin:0 auto;padding:36px 32px 48px;">
    <img src="cid:dispatch-logo@halestudio.co" alt="Studio Dispatch" width="48" height="48" style="display:block;margin-bottom:20px;"/>
    <p style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#8a7a62;">The Studio Dispatch  ·  № 42</p>
    <h1 style="font-weight:500;font-size:32px;line-height:1.2;margin:12px 0 20px;">Sitting in a mail client</h1>
    <p style="font-size:17px;line-height:1.6;">Most readers still render HTML like it's 2009. proto-mail treats the reading pane as a room: paper for letters, charcoal for chrome.</p>
    <h2 style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#8a7a62;margin-top:32px;">This week</h2>
    <ul style="font-size:16px;line-height:1.6;padding-left:18px;">
      <li>CID images resolved without leaking remote trackers</li>
      <li>j/k navigation landed</li>
      <li>The courtyard dinner is Friday (leave the laptop)</li>
    </ul>
    <p style="margin-top:36px;color:#8a7a62;">Until next Tuesday.</p>
  </div>
</div>`,
  inlines: [
    { cid: "dispatch-logo@halestudio.co", filename: "dispatch-mark.png", contentType: "image/png", content: logoPng },
  ],
});

// ── GitHub plain notification ───────────────────────────────────────────────
add("2026-08-28-github.eml", {
  from: `"Jordan Park" <notifications@github.com>`,
  to: NORA,
  subject: "[halestudio/proto-mail] Reading pane: block remote images by default (#184)",
  date: new Date("2026-08-28T18:33:09Z"),
  messageId: "proto-mail/184/issue@github.com",
  text: `Jordan Park opened an issue

halestudio/proto-mail #184

Reading pane: block remote images by default

Newsletters will try to load tracking pixels. Default should be blocked,
with an explicit "Load remote images" control on the message.

— 
Reply to this email directly or view it on GitHub.
`,
});

// ── Shipping confirmation HTML ──────────────────────────────────────────────
add("2026-07-15-shipping.eml", {
  from: `"Corso Goods" <orders@corso.goods>`,
  to: NORA,
  subject: "Your order is out — oak tray, brass clips",
  date: new Date("2026-07-15T16:20:00Z"),
  messageId: "corso-8821@corso.goods",
  text: `Corso Goods

Order CG-8821 is with the carrier.

Oak desk tray  × 1
Brass binder clips  × 2

Tracking: 1Z8821CORSO
ETA: July 18

Thank you for ordering from the shop.
`,
  html: `<div style="font-family:Palatino,Georgia,serif;background:#efe8dc;padding:40px 20px;color:#2a241c;">
  <div style="max-width:440px;margin:0 auto;background:#fffdf8;padding:36px;border:1px solid #d9cbb6;">
    <p style="letter-spacing:.2em;font-size:11px;text-transform:uppercase;color:#8c7b64;">Corso Goods</p>
    <h1 style="font-weight:400;font-size:26px;">Your order is out</h1>
    <p>Oak desk tray × 1<br/>Brass binder clips × 2</p>
    <p style="font-size:14px;color:#6b5d4d;">Tracking <strong>1Z8821CORSO</strong><br/>ETA July 18</p>
    <p style="margin-top:28px;font-size:13px;color:#8c7b64;">Thank you for ordering from the shop.</p>
  </div>
</div>`,
});

// ── Mom, plain ──────────────────────────────────────────────────────────────
add("2026-05-04-elena.eml", {
  from: MOM,
  to: NORA,
  subject: "The plum tree finally",
  date: new Date("2026-05-04T01:11:00Z"),
  messageId: "plum-tree@fastmail.com",
  text: `Nora,

The plum tree in the back decided to be generous this year. I put a crate
aside. Come by Sunday if you're not buried.

Dad says hello and to stop working through dinner.

Love,
Mama
`,
});

// ── Linear marketing HTML ───────────────────────────────────────────────────
add("2026-08-12-linear.eml", {
  from: `"Linear" <changelog@linear.app>`,
  to: NORA,
  subject: "Changelog: cycles, estimates, and a faster command menu",
  date: new Date("2026-08-12T17:00:00Z"),
  messageId: "changelog-2026-08-12@linear.app",
  text: `Linear Changelog

Cycles now roll automatically at midnight in your workspace timezone.
Estimates can be pointed in Fibonacci or a custom scale.
The command menu opens 40ms faster. You will feel it.

Read the post: https://linear.app/changelog
`,
  html: `<div style="font-family:Inter,Helvetica,sans-serif;background:#0d0d0d;color:#e6e6e6;padding:48px 24px;">
  <div style="max-width:520px;margin:0 auto;">
    <p style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#8a8a8a;">Changelog</p>
    <h1 style="font-weight:500;font-size:28px;color:#fff;">Cycles, estimates, a faster command menu</h1>
    <p style="line-height:1.6;color:#c8c8c8;">Cycles now roll automatically at midnight in your workspace timezone. Estimates can be pointed in Fibonacci or a custom scale. The command menu opens 40ms faster. You will feel it.</p>
    <p><a href="https://linear.app/changelog" style="color:#5e6ad2;">Read the post</a></p>
  </div>
</div>`,
});

// ── Figma invoice + PDF ─────────────────────────────────────────────────────
add("2026-04-20-figma-invoice.eml", {
  from: `"Figma Billing" <billing@figma.com>`,
  to: NORA,
  cc: MAYA,
  subject: "Invoice INV-1842 from Figma",
  date: new Date("2026-04-20T12:00:00Z"),
  messageId: "inv-1842@figma.com",
  text: `Invoice INV-1842
Figma Professional  ×  3 seats
Period: 20 Mar 2026 – 20 Apr 2026
Total: $45.00 USD  (paid)

PDF attached.
`,
  html: `<div style="font-family:Helvetica,Arial,sans-serif;color:#1e1e1e;padding:24px;">
  <h1 style="font-size:20px;">Invoice INV-1842</h1>
  <p>Figma Professional × 3 seats<br/>Period: 20 Mar 2026 – 20 Apr 2026</p>
  <p style="font-size:24px;margin:16px 0;">$45.00 <span style="font-size:14px;color:#6b6b6b;">USD · paid</span></p>
  <p style="color:#6b6b6b;font-size:13px;">A PDF copy is attached for your records.</p>
</div>`,
  attachments: [
    { filename: "INV-1842-figma.pdf", contentType: "application/pdf", content: figmaPdf },
  ],
});

// ── Photographer images ─────────────────────────────────────────────────────
add("2026-07-08-proofs.eml", {
  from: `"Iris Cole" <iris@cole-studio.com>`,
  to: NORA,
  subject: "Proofs from the loft — two frames",
  date: new Date("2026-07-08T21:15:00Z"),
  messageId: "proofs-loft@cole-studio.com",
  text: `Nora,

Two frames from Tuesday. Warm window and the cool hallway.

Full set is on the contact sheet if you want the rest.

Iris Cole
`,
  html: `<div style="font-family:Georgia,serif;color:#222;line-height:1.5;">
  <p>Nora,</p>
  <p>Two frames from Tuesday. Warm window and the cool hallway.</p>
  <p>Full set is on the contact sheet if you want the rest.</p>
  <p>Iris Cole</p>
</div>`,
  attachments: [
    { filename: "loft-window.png", contentType: "image/png", content: photoWarm },
    { filename: "loft-hall.png", contentType: "image/png", content: photoCool },
  ],
});

// ── Meeting notes + txt ─────────────────────────────────────────────────────
add("2026-08-25-studio-sync.eml", {
  from: JORDAN,
  to: [NORA, MAYA, ALEX],
  subject: "Notes from today's studio sync",
  date: new Date("2026-08-25T23:04:00Z"),
  messageId: "sync-2026-08-25@halestudio.co",
  text: `Notes attached as studio-sync-0825.txt.

Short version: type ramp locked, trackers stay blocked, Jordan sending motion by Thursday.

— J
`,
  attachments: [
    { filename: "studio-sync-0825.txt", contentType: "text/plain", content: notesTxt },
  ],
});

// ── Notion digest ───────────────────────────────────────────────────────────
add("2026-08-17-notion.eml", {
  from: `"Notion" <notify@notion.so>`,
  to: NORA,
  subject: "Hale Studio — 6 updates in Private list",
  date: new Date("2026-08-17T14:00:00Z"),
  messageId: "digest-2026-08-17@notion.so",
  text: `Hale Studio workspace

Maya Chen edited Reading pane
Jordan Park commented on Motion spec
Alex Rivera added CID rewrite
Priya Shah updated Launch holes
Tom Ellison completed PDF size
Nora Hale created Courtyard dinner

Open in Notion
`,
  html: `<div style="font-family:ui-sans-serif,system-ui,sans-serif;padding:28px;color:#37352f;">
  <p style="font-size:12px;color:#9b9a97;">Hale Studio</p>
  <h1 style="font-size:22px;font-weight:600;">6 updates in Private list</h1>
  <ul style="line-height:1.8;padding-left:18px;">
    <li>Maya Chen edited <strong>Reading pane</strong></li>
    <li>Jordan Park commented on <strong>Motion spec</strong></li>
    <li>Alex Rivera added <strong>CID rewrite</strong></li>
    <li>Priya Shah updated <strong>Launch holes</strong></li>
    <li>Tom Ellison completed <strong>PDF size</strong></li>
    <li>Nora Hale created <strong>Courtyard dinner</strong></li>
  </ul>
</div>`,
});

// ── Substack with remote image ──────────────────────────────────────────────
add("2026-08-09-substack.eml", {
  from: `"Field Notes" <fieldnotes@substack.com>`,
  to: NORA,
  subject: "On rooms, not feeds",
  date: new Date("2026-08-09T11:30:00Z"),
  messageId: "fn-rooms@substack.com",
  text: `On rooms, not feeds

A mail client is a room. A feed is a hallway. We keep confusing them.

The whole essay is on Substack. This copy is the letter version.

— Field Notes
`,
  html: `<div style="font-family:Iowan Old Style,Georgia,serif;color:#2b241c;padding:32px;max-width:560px;">
  <p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8a7d6b;">Field Notes</p>
  <h1 style="font-weight:400;font-size:30px;">On rooms, not feeds</h1>
  <p style="font-size:18px;line-height:1.65;">A mail client is a room. A feed is a hallway. We keep confusing them.</p>
  <p>The tracking pixel below is intentional — proto-mail should block it until you ask.</p>
  <img src="https://substack.com/img/substack-logo.png" alt="Substack" width="120" height="24"/>
  <p style="margin-top:24px;color:#8a7d6b;">— Field Notes</p>
</div>`,
});

// ── AWS bill ────────────────────────────────────────────────────────────────
add("2026-08-03-aws.eml", {
  from: `"Amazon Web Services" <no-reply@amazon.com>`,
  to: NORA,
  subject: "AWS Billing Statement Available [Account 882190]",
  date: new Date("2026-08-03T07:12:00Z"),
  messageId: "aws-bill-2026-08@amazon.com",
  text: `Dear Nora Hale,

Your AWS bill for July 2026 is available.

Account: 882190
Amount: $23.18
Largest service: Amazon S3  $14.02
   (that's the R2-shaped bucket of .eml files, more or less)

View in the billing console.
`,
});

// ── Friend sharing a link ───────────────────────────────────────────────────
add("2026-08-27-link.eml", {
  from: `"Bee Ellison" <bee@ellison.work>`,
  to: NORA,
  subject: "this is the density",
  date: new Date("2026-08-27T02:44:00Z"),
  messageId: "density@ellison.work",
  text: `you've been talking about three-pane mail for a year

https://craigmod.com/essays/email/

read the bit about sitting with a letter. that's the bar.

b
`,
});

// ── Support ticket ──────────────────────────────────────────────────────────
add("2026-06-18-support.eml", {
  from: `"Nia at Fastmail" <support@fastmail.com>`,
  to: NORA,
  subject: "Re: IMAP flags not sticking on proto-mail import",
  date: new Date("2026-06-18T15:55:00Z"),
  messageId: "fm-ticket-9912-2@fastmail.com",
  inReplyTo: "fm-ticket-9912-1@halestudio.co",
  references: ["fm-ticket-9912-1@halestudio.co"],
  text: `Hi Nora,

Thanks for the headers. The \\Seen flags were being stripped because the
importer was rewriting Message-ID. We've patched staging; your next import
should keep read state.

If you're using a local-only reader, storing unread in localStorage is
honest — just don't pretend it's sync.

— Nia
Fastmail Support
`,
});

// ── Recruiter ───────────────────────────────────────────────────────────────
add("2026-04-02-recruiter.eml", {
  from: `"Owen Blake" <owen.blake@northline.talent>`,
  to: NORA,
  subject: "Staff designer, quiet product — SF / remote",
  date: new Date("2026-04-02T18:20:00Z"),
  messageId: "owen-staff-design@northline.talent",
  text: `Nora,

A company that makes tools for writers is looking for a staff designer.
They care about density and type. It sounded like your studio.

No urgency. Happy to send the brief if you want it.

Owen Blake
Northline
`,
});

// ── Self note ───────────────────────────────────────────────────────────────
add("2026-08-30-note-to-self.eml", {
  from: NORA,
  to: NORA,
  subject: "don't ship the purple one",
  date: new Date("2026-08-30T04:18:00Z"),
  messageId: "note-purple@halestudio.co",
  text: `future nora:

if the reading pane looks like a dashboard, you lost.
if search takes a round trip for 30 letters, you lost.
if remote images load themselves, you lost.

the courtyard is tomorrow. leave the laptop.
`,
});

// ── Press mention ───────────────────────────────────────────────────────────
add("2026-03-28-press.eml", {
  from: `"Ada Voss" <ada@printculture.press>`,
  to: NORA,
  cc: MAYA,
  subject: "Short mention in the April tools column",
  date: new Date("2026-03-28T16:40:00Z"),
  messageId: "april-column@printculture.press",
  text: `Nora, Maya —

We're running a small mention of Hale Studio in the April tools column.
Two sentences, no screenshots unless you want to send a crop of the
reading pane (paper canvas, not the chrome).

Deadline Wednesday.

Ada Voss
Print Culture
`,
  html: `<div style="font-family:Georgia,serif;color:#222;">
  <p>Nora, Maya —</p>
  <p>We're running a small mention of Hale Studio in the April tools column. Two sentences, no screenshots unless you want to send a crop of the reading pane (paper canvas, not the chrome).</p>
  <p>Deadline Wednesday.</p>
  <p style="color:#666;">Ada Voss<br/>Print Culture</p>
</div>`,
});

// ── Vercel invoice HTML ─────────────────────────────────────────────────────
add("2026-07-01-vercel.eml", {
  from: `"Vercel" <billing@vercel.com>`,
  to: NORA,
  subject: "Your Vercel invoice for June 2026",
  date: new Date("2026-07-01T08:01:00Z"),
  messageId: "inv-june-2026@vercel.com",
  text: `Vercel Pro — June 2026
$20.00
Project: proto-mail
Thank you for building with Vercel.
`,
  html: `<div style="font-family:Inter,sans-serif;background:#000;color:#fff;padding:40px;">
  <div style="max-width:420px;margin:0 auto;">
    <p style="opacity:.5;font-size:12px;letter-spacing:.2em;text-transform:uppercase;">Invoice</p>
    <h1 style="font-weight:500;">$20.00</h1>
    <p>Vercel Pro · June 2026<br/>Project: proto-mail</p>
    <p style="opacity:.5;font-size:13px;margin-top:24px;">Thank you for building with Vercel.</p>
  </div>
</div>`,
});

// ── Calendar / studio visit ─────────────────────────────────────────────────
add("2026-05-20-visit.eml", {
  from: `"Priya Shah" <priya@halestudio.co>`,
  to: NORA,
  cc: [MAYA, JORDAN],
  subject: "Thursday: Ada from Print Culture on site",
  date: new Date("2026-05-20T17:05:00Z"),
  messageId: "visit-ada@halestudio.co",
  text: `Heads up — Ada is coming by the studio Thursday at 11.

She wants to sit with proto-mail for twenty minutes. Let's have the
sample mailbox loaded, not a blank state.

I'll put out the oak tray.

Priya
`,
  html: `<div style="font-family:Georgia,serif;color:#1a1714;line-height:1.55;">
  <p>Heads up — Ada is coming by the studio Thursday at 11.</p>
  <p>She wants to sit with <strong>proto-mail</strong> for twenty minutes. Let's have the sample mailbox loaded, not a blank state.</p>
  <p>I'll put out the oak tray.</p>
  <p>Priya</p>
</div>`,
});

// ── Welcome / weekly (HTML + CID) ───────────────────────────────────────────
add("2026-08-29-weekly.eml", {
  from: `"Hale Studio" <studio@halestudio.co>`,
  to: NORA,
  subject: "This week at the studio",
  date: new Date("2026-08-29T16:00:00Z"),
  messageId: "weekly-2026-08-29@halestudio.co",
  text: `This week at the studio

- proto-mail sample corpus lands
- Courtyard dinner Friday (Nora + Sam)
- Motion spec from Jordan due Thursday

Leave the building at a human hour.
`,
  html: `<div style="font-family:Georgia,serif;background:#1a1714;color:#f0ebe3;padding:40px 28px;">
  <img src="cid:studio-mark@halestudio.co" width="48" height="48" alt="Hale Studio"/>
  <h1 style="font-weight:400;font-size:26px;margin-top:16px;">This week at the studio</h1>
  <ul style="line-height:1.8;">
    <li>proto-mail sample corpus lands</li>
    <li>Courtyard dinner Friday (Nora + Sam)</li>
    <li>Motion spec from Jordan due Thursday</li>
  </ul>
  <p style="color:#c4a35a;margin-top:28px;">Leave the building at a human hour.</p>
</div>`,
  inlines: [
    { cid: "studio-mark@halestudio.co", filename: "studio-mark.png", contentType: "image/png", content: studioMark },
  ],
});

// ── Mixed: HTML newsletter + PDF + image ────────────────────────────────────
add("2026-07-22-print-culture.eml", {
  from: `"Print Culture" <letters@printculture.press>`,
  to: NORA,
  subject: "April column PDF + the crop we used",
  date: new Date("2026-07-22T19:30:00Z"),
  messageId: "april-pdf@printculture.press",
  text: `Nora —

As promised: the column as PDF, and the crop of the reading pane (paper
canvas only).

Ada
`,
  html: `<div style="font-family:Georgia,serif;color:#222;">
  <p>Nora —</p>
  <p>As promised: the column as PDF, and the crop of the reading pane (paper canvas only).</p>
  <p>Ada</p>
</div>`,
  attachments: [
    {
      filename: "print-culture-april-tools.pdf",
      contentType: "application/pdf",
      content: makePdf("Tools column · April", [
        "Hale Studio has been quietly building a mail reader",
        "that treats letters as rooms. The chrome is charcoal.",
        "The page is paper. Remote images stay outside until asked.",
      ]),
    },
    { filename: "reading-pane-crop.png", contentType: "image/png", content: photoWarm },
  ],
});

for (const { filename, raw } of emails) {
  writeFileSync(join(OUT, filename), raw);
}

console.log(`Wrote ${emails.length} messages to ${OUT}`);
