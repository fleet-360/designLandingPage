// Key lines for the top of a spec request page, written by Claude from a few words sales typed about the
// client's problem ("הלקוח רוצה להוציא כתבי כמויות של ברזל"). Sales reviews and edits them before saving.
// Needs ANTHROPIC_API_KEY (Vercel: landing-page-build -> Settings -> Environment Variables).
// Optional: ANTHROPIC_MODEL replaces the model below.
// Only the problem text goes to the API: no client name, company or contact details.
import Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "./http.js";

const MODEL = "claude-opus-5-5";

const SYSTEM = `You write short Hebrew marketing lines for Pro Algorithm, an Israeli software house that builds custom systems, automations and AI tools for businesses.
Before development, a client buys a paid "discovery sprint" (ספרינט איפיון): a kickoff meeting, mapping of their work processes, system architecture, and at the end a requirements document, process flowcharts and a technology roadmap with time and budget estimates.

A salesperson gives you a few words about the client's problem or goal. You write the lines that open the client's personal spec request page, so the client feels at once that we understood what they need.

Write:
- headlines: 3 different options for one headline. An inviting call to start the journey toward the client's specific goal, naming that goal in the client's own terms. Up to 14 words, may end with "!". The three options should differ in angle (the goal reached, the pain gone, the journey together), not only in a word or two.
  These two examples show the tone only. They come from other fields on purpose: never copy their wording or their sentence pattern, write fresh for this client.
  goal "המשרד רוצה לשבץ טכנאים בלי טלפונים" -> "נצא לדרך שבסופה כל טכנאי יודע בבוקר לאן הוא נוסע!"
  goal "להפסיק להקליד חשבוניות ספקים ידנית" -> "בואו נגיע יחד לחודש שבו חשבוניות הספקים נקלטות במערכת מעצמן!"
- lines: 3 short supporting sentences (up to 18 words each) that show we understand the client's day-to-day pain around this goal and what will change once it is solved. Concrete to their field, written about their work, not about us.

Rules:
- Natural, warm Israeli Hebrew, the way a sharp salesperson talks. Address the client in plural (אתם, לכם, שלכם) or say "we/together" (נצא יחד, בואו נבנה). Never singular forms that assume a gender (בוא, תתחיל, לך).
- Be specific to the field. Use the professional words a person in that field uses.
- Never invent numbers, percentages, time frames or promises (no "תוך שבוע", no "חיסכון של 70%").
- Do not mention AI, the discovery sprint itself, prices, or Pro Algorithm by name.
- Avoid phrasing that reads like a chatbot: no "לא X, אלא Y" contrasts, no colons, no dashes, no emoji, no quotation marks.
- If the input is not a real business problem, still write your best lines for whatever goal it suggests.`;

const SCHEMA = {
  type: "object",
  properties: {
    headlines: { type: "array", items: { type: "string" } },
    lines: { type: "array", items: { type: "string" } },
  },
  required: ["headlines", "lines"],
  additionalProperties: false,
};

let client = null;

export const pitchConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

/** problem (a few words from sales) -> { headlines: [3], lines: [3] } */
export async function writePitch(problem) {
  if (!pitchConfigured()) throw new HttpError(503, "ai_not_configured");
  client ||= new Anthropic({ timeout: 60_000, maxRetries: 1 });
  let response;
  try {
    response = await client.beta.messages.create({
      model: process.env.ANTHROPIC_MODEL || MODEL,
      max_tokens: 8000,
      // a few short lines: low effort keeps the wait for sales short
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      // a declined request is retried on another model inside the same call
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: problem }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      console.error("[ai-pitch] key rejected:", err.message);
      throw new HttpError(503, "ai_not_configured");
    }
    if (err instanceof Anthropic.RateLimitError) throw new HttpError(503, "ai_busy");
    if (err instanceof Anthropic.APIError) {
      console.error(`[ai-pitch] API error ${err.status}:`, err.message);
      throw new HttpError(502, "ai_failed");
    }
    console.error("[ai-pitch] request failed:", err?.message || err);
    throw new HttpError(502, "ai_failed");
  }
  if (response.stop_reason === "refusal") throw new HttpError(422, "ai_refused");
  const text = response.content.find((b) => b.type === "text")?.text;
  let out;
  try {
    out = JSON.parse(text || "");
  } catch {
    console.error("[ai-pitch] not JSON, stop_reason:", response.stop_reason);
    throw new HttpError(502, "ai_failed");
  }
  const clean = (a, n) => (Array.isArray(a) ? a : []).map((s) => String(s).trim()).filter(Boolean).slice(0, n);
  const result = { headlines: clean(out.headlines, 3), lines: clean(out.lines, 3) };
  if (!result.headlines.length) throw new HttpError(502, "ai_failed");
  return result;
}
