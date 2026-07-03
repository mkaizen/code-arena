import DOMPurify from "dompurify";

/**
 * Problem statements are authored HTML rendered via dangerouslySetInnerHTML.
 * While only admins/setters author them today, sanitizing keeps a compromised
 * or future untrusted author from injecting scripts into every solver's page.
 */
export function sanitizeStatement(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "hr", "b", "strong", "i", "em", "u", "s", "code", "pre", "kbd", "samp",
      "ul", "ol", "li", "blockquote", "sub", "sup", "span", "div",
      "h1", "h2", "h3", "h4", "h5", "h6", "table", "thead", "tbody", "tr", "th", "td", "a",
    ],
    ALLOWED_ATTR: ["href", "title", "colspan", "rowspan"],
    // Force any links to be safe.
    ADD_ATTR: ["target", "rel"],
  });
}
