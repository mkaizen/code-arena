import { useState } from "react";

interface ShareButtonsProps {
  /** Post title, used as the pre-filled text when sharing to X. */
  title: string;
  /** Canonical absolute URL of the post being shared. */
  url: string;
}

const btnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "7px 13px",
  border: "1px solid var(--line)",
  borderRadius: 8,
  background: "var(--panel)",
  color: "var(--txt-2)",
  fontFamily: "var(--disp)",
  fontSize: 13,
  fontWeight: 600,
  textDecoration: "none",
  cursor: "pointer",
};

/** Opens a share-intent popup without handing the opener to the new tab. */
function openIntent(href: string) {
  window.open(href, "_blank", "noopener,noreferrer,width=600,height=520");
}

/**
 * A small share row for blog posts: X, LinkedIn, and copy-link. Brand marks are
 * inline SVG so this stays dependency-free (no icon package). The URL is the
 * post's canonical codearena.space address, so a link shared from any host
 * still points at production.
 */
export function ShareButtons({ title, url }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  const xHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;
  const liHref = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (insecure context / denied) — leave the label as-is.
    }
  }

  return (
    <div style={{ borderTop: "1px solid var(--line)", marginTop: 40, paddingTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <span style={{ color: "var(--txt-3)", fontSize: 13, fontFamily: "var(--mono)", marginRight: 2 }}>
          Share this post
        </span>

        <button type="button" onClick={() => openIntent(xHref)} style={btnStyle} aria-label="Share on X">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          X
        </button>

        <button type="button" onClick={() => openIntent(liHref)} style={btnStyle} aria-label="Share on LinkedIn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
          </svg>
          LinkedIn
        </button>

        <button
          type="button"
          onClick={copyLink}
          style={{ ...btnStyle, color: copied ? "var(--v-ac)" : "var(--txt-2)", borderColor: copied ? "var(--v-ac)" : "var(--line)" }}
          aria-label="Copy link"
        >
          {copied ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          )}
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
