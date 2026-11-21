// node --test tests/  (npm test). The Anthropic API is stubbed: no key or network needed.
import test from "node:test";
import assert from "node:assert/strict";

process.env.ANTHROPIC_API_KEY = "test-key";
const { writePitch } = await import("../api/_lib/ai-pitch.js");
const { pitchOf } = await import("../api/_routes/sales/discovery.js");

const message = (text, extra = {}) => ({
  id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5",
  content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 10 }, ...extra,
});

// the SDK client is made once and keeps the fetch it found, so one stub serves every test
let next = null;
const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) });
  return new Response(JSON.stringify(next.reply), { status: next.status, headers: { "content-type": "application/json" } });
};
function stubFetch(reply, status = 200) {
  next = { reply, status };
  calls.length = 0;
  return calls;
}

test("sends only the problem, with structured output and fallbacks, and returns the lines", async () => {
  const calls = stubFetch(message(JSON.stringify({
    headlines: [" נצא יחד לדרך שבסופה כל ליד יעלה לכם הרבה פחות! ", "ב", "ג", "ד"],
    lines: ["א", "", "ב", "ג", "ד"],
  })));
  const r = await writePitch("להוזיל מחיר ליד בפייסבוק");
  assert.deepEqual(r, { headlines: ["נצא יחד לדרך שבסופה כל ליד יעלה לכם הרבה פחות!", "ב", "ג"], lines: ["א", "ב", "ג"] });
  const { url, headers, body } = calls[0];
  assert.match(url, /\/v1\/messages/);
  assert.match(`${headers.get("x-api-key")} ${headers.get("authorization")}`, /test-key/);
  assert.match(headers.get("anthropic-beta"), /server-side-fallback-2026-07-01/);
  assert.equal(body.model, "claude-opus-5-5");
  assert.equal(body.fallbacks, "default");
  assert.equal(body.output_config.format.type, "json_schema");
  assert.deepEqual(body.messages, [{ role: "user", content: "להוזיל מחיר ליד בפייסבוק" }]);
});

test("a refusal, a reply that is not JSON, and a rejected key each give a clear error", async () => {
  stubFetch(message("", { stop_reason: "refusal", content: [] }));
  await assert.rejects(writePitch("x y z"), { code: "ai_refused" });
  stubFetch(message("not json"));
  await assert.rejects(writePitch("x y z"), { code: "ai_failed" });
  stubFetch({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, 401);
  await assert.rejects(writePitch("x y z"), { code: "ai_not_configured" });
});

test("pitchOf keeps what sales left and drops an empty pitch", () => {
  assert.equal(pitchOf(null), null);
  assert.equal(pitchOf({ problem: "x", headline: " ", lines: ["", "  "] }), null);
  assert.deepEqual(JSON.parse(pitchOf({ problem: " ברזל ", headline: " כותרת ", lines: ["א", "", "ב"] })),
    { problem: "ברזל", headline: "כותרת", lines: ["א", "ב"] });
});
