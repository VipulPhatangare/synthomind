/**
 * Minimal, dependency-free renderer for the small subset of markdown the
 * chatbot's Gemini prompt actually produces: **bold**, "* "/"- " bullet
 * lists, and paragraph breaks. Builds React elements directly (no
 * dangerouslySetInnerHTML) so there's no HTML-injection surface even though
 * the source is our own LLM call.
 */
function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
}

export default function MarkdownLite({ text }) {
  if (!text) return null;

  const lines = text.split("\n");
  const blocks = [];
  let currentList = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const bulletMatch = line.match(/^[-*]\s+(.*)/);
    if (bulletMatch) {
      if (!currentList) {
        currentList = [];
        blocks.push({ type: "ul", items: currentList });
      }
      currentList.push(bulletMatch[1]);
      continue;
    }
    currentList = null;
    if (line !== "") blocks.push({ type: "p", text: line });
  }

  return (
    <div className="space-y-1.5">
      {blocks.map((b, i) =>
        b.type === "ul" ? (
          <ul key={i} className="list-disc space-y-1 pl-4">
            {b.items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
          </ul>
        ) : (
          <p key={i}>{renderInline(b.text)}</p>
        )
      )}
    </div>
  );
}
