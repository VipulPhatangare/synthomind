import Popover from "./Popover.jsx";
import { glossaryEntry } from "../../lib/glossary.js";

/**
 * Wraps a technical term with a dotted underline; tapping it opens a
 * one-sentence plain-English definition from lib/glossary.js. Use inline:
 *   the <Term term="velocity">velocity</Term> is +0.23/quarter
 */
export default function Term({ term, children }) {
  const definition = glossaryEntry(term);
  if (!definition) return children; // fails open — a missing glossary entry shouldn't break the sentence

  return (
    <Popover
      trigger={
        <span className="cursor-help border-b border-dotted border-ink-muted/60 text-inherit">
          {children}
        </span>
      }
    >
      {definition}
    </Popover>
  );
}
