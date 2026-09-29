// Preset prompts shown as clickable chips in the chat panel, grounded in
// this platform's actual data model (verdicts, sufficiency, evidence,
// feedback) so every one of them resolves to a real, answerable query.

export const SCOPED_TEMPLATES = [
  "Give me a full summary",
  "Is {name} improving or declining overall?",
  "What's {name}'s biggest risk area right now?",
  "How does {name} compare to their role target level?",
  "What should {name} focus on next quarter?",
  "Any red flags in code quality or collaboration?",
  "Summarize recent manager feedback",
  "How does peer feedback compare to manager feedback?",
  "What training or certifications has {name} completed?",
  "What's the confidence level behind these verdicts?",
  "Show {name}'s trajectory over the last few quarters",
  "Which competencies have insufficient evidence?",
];

export const GENERAL_TEMPLATES = [
  "Who is declining the most this quarter?",
  "Which team has the most improving employees?",
  "Show me employees with insufficient evidence",
  "Who is at risk of attrition based on recent signals?",
  "Which competency has the weakest evidence across the org?",
  "Summarize this quarter's org-wide trends",
  "Who are the top performers in problem solving?",
  "Which department has the most open disputes?",
  "Who improved the most since last quarter?",
  "List employees below their role target level",
  "What are common themes in recent manager feedback?",
  "Which employees have been stagnating for 2+ quarters?",
];

export function resolveTemplate(text, firstName) {
  return firstName ? text.replace(/\{name\}/g, firstName) : text.replace(/\{name\}\s*/g, "");
}
