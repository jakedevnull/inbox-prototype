"use client";

import { useEffect, useRef, useState } from "react";

export function HtmlFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(480);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;

    const resize = () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      const h = Math.max(
        doc.documentElement.scrollHeight,
        doc.body?.scrollHeight ?? 0,
        240,
      );
      setHeight(Math.min(h + 8, 4000));
    };

    frame.addEventListener("load", resize);
    const t = window.setTimeout(resize, 60);
    return () => {
      frame.removeEventListener("load", resize);
      window.clearTimeout(t);
    };
  }, [html]);

  return (
    <iframe
      ref={ref}
      title="Message body"
      sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
      referrerPolicy="no-referrer"
      srcDoc={html}
      style={{ height }}
      className="w-full rounded-sm border border-[color:var(--line)] bg-paper-letter"
    />
  );
}
