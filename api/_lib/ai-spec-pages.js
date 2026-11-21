// Which pages of the Canva spec go into the contract as Appendix B: Claude reads the text of each page
// (extracted in the browser, so the PDF itself is not sent) and names the page with the short proposal
// summary and the page with the hours estimate. Sales sees the pick and can change it.
// Usually that is the first page and the last one, which is also the answer when the AI is unavailable.
// Needs ANTHROPIC_API_KEY (the same key as api/_lib/ai-pitch.js). Optional: ANTHROPIC_MODEL.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5-5";

const SYSTEM = `You read a software project's spec document (Hebrew, exported from Canva as a slide deck), given as the text of each page.
Find two pages:
- summaryPage: the page with the short summary of the proposal: what will be built, the solution in brief, the scope at a glance. Usually the first page, or the first page with real content after a cover.
- hoursPage: the page with the estimate of development hours (a table or list of components with hours, a total of hours, a "בנק שעות" or "הערכת שעות"). Usually the last page.
Answer with the page numbers as given. If a page cannot be found, answer 0 for it. Never guess a page whose text shows nothing related.`;

const SCHEMA = {
  type: "object",
  properties: {
    summaryPage: { type: "integer" },
    hoursPage: { type: "integer" },
  },
  required: ["summaryPage", "hoursPage"],
  additionalProperties: false,
};

let client = null;

export const specAiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

const fallback = (count, reason) => ({ pages: [...new Set([1, count])], summaryPage: 1, hoursPage: count, source: "default", reason });

/** pages: [{ n, text }] (all pages of the spec, in order) -> { pages, summaryPage, hoursPage, source: "ai"|"default", reason? } */
export async function pickSpecPages(pages) {
  const count = pages.length;
  if (count <= 2) return { pages: pages.map((p) => p.n), summaryPage: 1, hoursPage: count, source: "default", reason: "short" };
  if (!specAiConfigured()) return fallback(count, "ai_not_configured");
  // Canva sometimes exports text as shapes: with almost no text there is nothing to read
  if (pages.reduce((a, p) => a + p.text.length, 0) < 40) return fallback(count, "no_text");
  client ||= new Anthropic({ timeout: 45_000, maxRetries: 1 });
  const doc = pages.map((p) => `<page n="${p.n}">\n${p.text}\n</page>`).join("\n");
  let response;
  try {
    response = await client.beta.messages.create({
      model: process.env.ANTHROPIC_MODEL || MODEL,
      max_tokens: 4000,
      // a simple lookup: low effort keeps the wait short
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: `The spec has ${count} pages.\n\n${doc}` }],
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) console.error(`[ai-spec-pages] API error ${err.status}:`, err.message);
    else console.error("[ai-spec-pages] request failed:", err?.message || err);
    return fallback(count, "ai_failed");
  }
  if (response.stop_reason === "refusal") return fallback(count, "ai_failed");
  let out;
  try {
    out = JSON.parse(response.content.find((b) => b.type === "text")?.text || "");
  } catch {
    console.error("[ai-spec-pages] not JSON, stop_reason:", response.stop_reason);
    return fallback(count, "ai_failed");
  }
  const ok = (n) => Number.isInteger(n) && n >= 1 && n <= count;
  const summaryPage = ok(out.summaryPage) ? out.summaryPage : 1;
  const hoursPage = ok(out.hoursPage) ? out.hoursPage : count;
  return { pages: [...new Set([summaryPage, hoursPage])].sort((a, b) => a - b), summaryPage, hoursPage, source: "ai" };
}
