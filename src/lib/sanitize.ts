import sanitizeHtml from "sanitize-html";

const BLOCKED_SRC =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="72" viewBox="0 0 160 72">
      <rect width="160" height="72" fill="#ece6da"/>
      <text x="80" y="42" text-anchor="middle" font-family="Georgia,serif" font-size="11" fill="#8a7a62">remote image blocked</text>
    </svg>`,
  );

const extraTags = [
  "img",
  "center",
  "hr",
  "font",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "span",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "pre",
  "code",
  "blockquote",
  "address",
];

export function sanitizeEmailHtml(
  html: string,
  opts: { messageId: string; loadRemote: boolean },
): string {
  return sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, ...extraTags],
    allowedAttributes: {
      "*": [
        "style",
        "class",
        "align",
        "valign",
        "width",
        "height",
        "bgcolor",
        "border",
        "cellpadding",
        "cellspacing",
        "colspan",
        "rowspan",
        "role",
        "aria-hidden",
      ],
      a: ["href", "name", "target", "rel", "title"],
      img: ["src", "alt", "width", "height", "style", "align", "border", "data-remote-src"],
    },
    allowedSchemes: ["http", "https", "mailto", "cid", "data"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tag, attribs) => ({
        tagName: "a",
        attribs: {
          ...attribs,
          target: "_blank",
          rel: "noopener noreferrer nofollow",
        },
      }),
      img: (_tag, attribs) => {
        const src = attribs.src ?? "";
        if (src.toLowerCase().startsWith("cid:")) {
          const cid = src.slice(4).replace(/^<|>$/g, "");
          attribs.src = `/api/messages/${encodeURIComponent(opts.messageId)}/cid/${encodeURIComponent(cid)}`;
        } else if (/^https?:/i.test(src)) {
          if (!opts.loadRemote) {
            attribs["data-remote-src"] = src;
            attribs.src = BLOCKED_SRC;
            attribs.alt = attribs.alt
              ? `${attribs.alt} (remote image blocked)`
              : "remote image blocked";
          }
        }
        return { tagName: "img", attribs };
      },
    },
  });
}

export function wrapHtmlDocument(body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<base target="_blank"/>
<style>
  html, body { margin: 0; padding: 0; background: #fffdf8; color: #1a1714; }
  body { font-family: Georgia, "Times New Roman", serif; font-size: 16px; line-height: 1.55; padding: 8px 4px 24px; }
  img { max-width: 100%; height: auto; }
  a { color: #8a5a22; }
  table { max-width: 100%; }
</style>
</head>
<body>${body}</body>
</html>`;
}
