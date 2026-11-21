// The demo film on the deal page: the client's demo (one self-contained HTML file) plays by itself inside
// a frame, with a cursor that moves, clicks and types, and a caption for each scene. Claude reads the demo's
// source and writes the script (the scenes and their actions); contracts/src/client/DemoFilm.jsx plays it
// through DRIVER, a small script added to the demo when it is served (api/_routes/sales/deal-file.js).
// Nothing is rendered to pixels: the film is the real demo, driven.
// Needs ANTHROPIC_API_KEY, like ai-pitch.js. Only the demo's source and the project name go to the API.
import { gunzipSync } from "node:zlib";
import Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "./http.js";

const MODEL = "claude-opus-5-5";

// the stage the demo plays on, in CSS pixels; the player scales it to the page width
export const STAGE = { w: 1280, h: 720 };

// what Claude may read: about 300k tokens. A bigger demo is refused, never cut, so the script is
// written from the whole source.
const MAX_SOURCE = 900_000;

// A ready video can be uploaded instead (a programmer recorded one). Vercel takes up to 4.5MB per request and
// per response, so it is stored and served in parts of VIDEO_PART bytes (api/_routes/sales/deal-file.js
// answers the browser's Range requests one part at a time).
export const VIDEO_PART = 2.5 * 1024 * 1024;
export const VIDEO_MAX = 60 * 1024 * 1024;
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

const ACTIONS = ["click", "type", "select", "hover", "drag", "scroll", "key", "wait", "highlight", "zoom", "zoomOut"];

/** the stored demo (gzip) -> its HTML */
export const demoHtml = (gz) => gunzipSync(gz).toString("utf8");

// Embedded images, fonts and long data runs mean nothing to the script and cost tokens: each is replaced
// by a short marker that says what was there.
export function demoSource(html) {
  const out = html
    .replace(/data:([\w/+.-]+);base64,[A-Za-z0-9+/=\s]{200,}/g, (_, type) => `data:${type};base64,[embedded ${type}]`)
    .replace(/[A-Za-z0-9+/]{400,}={0,2}/g, "[long base64 data]")
    .replace(/\bd="([^"]{400,})"/g, (_, d) => `d="${d.slice(0, 120)} [path data]"`)
    .replace(/(?:-?\d+(?:\.\d+)?\s*,\s*){150,}-?\d+(?:\.\d+)?/g, (m) => `${m.slice(0, 120)} [${m.split(",").length} numbers]`);
  if (out.length > MAX_SOURCE) throw new HttpError(413, "demo_too_big");
  return out;
}

const SYSTEM = `You direct short product films for Pro Algorithm, an Israeli software house that builds custom systems, automations and AI tools for businesses.
Before the client signs the work order, their personal deal page plays a film of the demo we built for them. The film is the real demo running in a ${STAGE.w}x${STAGE.h} frame (desktop layout, the page starts scrolled to the top), driven by a script you write: a visible cursor moves to elements, clicks, types and drags, and a caption under the frame says what is happening. The viewer only watches.

You get the demo's full source (one HTML file; embedded images and long data runs were replaced by markers). Read its markup and its JavaScript to know exactly which elements exist at each moment: many demos build their controls in JavaScript after each step (for example a side panel re-rendered with new buttons), so follow the code to know what appears after every action.

Write the film:
- 5 to 9 scenes, about 40 to 75 seconds in all. Tell the story of the demo: the starting point, the key actions, and the moment the result appears. End on the strongest result screen.
- Each scene has a caption and the actions that play while it shows. The first scene may open with a wait of 1500 ms so the viewer sees the starting screen.
- caption: one short Hebrew sentence (up to 12 words) about what the system does for the client in this scene, in the words a professional in their field uses. Plural or neutral forms only (no "בוא", "לך"). No colons, no dashes, no emoji, no quotes, no numbers or promises the demo does not show. Do not mention AI, Pro Algorithm or a demo.

Actions (field "do"):
- click: selector (+ optional text). The cursor glides there and clicks.
- type: selector of an input or textarea, value = the text, typed letter by letter.
- select: selector of a <select>, value = the option's value.
- hover: selector.
- drag: selector of what to drag, then either to (selector of the drop target) or dx/dy in pixels.
- scroll: selector to bring into view, or dy in pixels to scroll the page or the nearest scrollable panel.
- key: value = a key name (Enter, Escape, ArrowDown...), sent to the focused element.
- wait: ms. Use after actions that animate, load or compute (typically 600 to 1500 ms), and to let a result sink in (1500 to 2500 ms).
- highlight: selector, ms. A soft ring around an element the caption talks about.
- zoom: selector, scale (1.2 to 1.8). The camera moves in on that area until zoomOut. Use it on small details (a number, a warning, a table row) and always zoomOut before the next click elsewhere.
- zoomOut.

Selectors:
- Standard CSS selectors for document.querySelectorAll. Prefer ids, data- attributes and stable class names from the source. Avoid long chains and :nth-child unless nothing else identifies the element.
- text (optional): the element's visible text must include it. Use it to pick one button among many with the same class, e.g. selector "button" text "הבא".
- The element must exist and be visible when the action runs: if an earlier click renders it, it is there; if it appears after an animation or a timer, wait first.
- SVG shapes are fine (selector "[data-hit]" with an id, etc.).

The client's logo (field "brand"): the film shows the client's own logo inside the demo, as if the system were already theirs. Pick the one place where a product's logo naturally sits: usually the logo or the product name at the start of the top bar, the header or the sidebar, present from the first screen. selector (and text if needed) of that element; place "replace" when it is a logo image, an SVG or a logo mark the client's logo should take the place of, or "start" when it is a product name or title the logo should stand before. If the demo has no such place, selector "" (the logo then shows with the captions).

If you get a previous script with what failed when it played, keep what worked and fix the failing actions (and the brand selector if it failed), reading the source again for the right selectors.`;

const SCHEMA = {
  type: "object",
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          caption: { type: "string" },
          actions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                do: { type: "string", enum: ACTIONS },
                selector: { type: "string" },
                text: { type: "string" },
                value: { type: "string" },
                to: { type: "string" },
                dx: { type: "number" },
                dy: { type: "number" },
                ms: { type: "number" },
                scale: { type: "number" },
              },
              required: ["do"],
              additionalProperties: false,
            },
          },
        },
        required: ["caption", "actions"],
        additionalProperties: false,
      },
    },
    brand: {
      type: "object",
      properties: {
        selector: { type: "string" },
        text: { type: "string" },
        place: { type: "string", enum: ["replace", "start"] },
      },
      required: ["selector", "text", "place"],
      additionalProperties: false,
    },
  },
  required: ["scenes", "brand"],
  additionalProperties: false,
};

const s = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const n = (v, min, max) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : undefined);

/** a script from Claude or from the sales screen -> a safe script, or throws 400 */
export function cleanScript(x) {
  const scenes = (Array.isArray(x?.scenes) ? x.scenes : []).slice(0, 14).map((sc) => ({
    caption: s(sc?.caption, 140),
    actions: (Array.isArray(sc?.actions) ? sc.actions : []).slice(0, 30).filter((a) => ACTIONS.includes(a?.do)).map((a) => {
      const o = { do: a.do };
      for (const k of ["selector", "text", "value", "to"]) if (s(a[k], 400)) o[k] = s(a[k], 400);
      const dx = n(a.dx, -3000, 3000); if (dx !== undefined) o.dx = dx;
      const dy = n(a.dy, -6000, 6000); if (dy !== undefined) o.dy = dy;
      const ms = n(a.ms, 0, 8000); if (ms !== undefined) o.ms = Math.round(ms);
      const scale = n(a.scale, 1, 2.5); if (scale !== undefined) o.scale = scale;
      return o;
    }),
  })).filter((sc) => sc.caption || sc.actions.length);
  if (!scenes.length) throw new HttpError(400, "bad_script");
  // where the client's logo goes in the demo (the player places it there); none: with the captions
  const brand = s(x?.brand?.selector, 400)
    ? { selector: s(x.brand.selector, 400), ...(s(x.brand.text, 200) && { text: s(x.brand.text, 200) }), place: x.brand.place === "start" ? "start" : "replace" }
    : null;
  return { scenes, ...(brand && { brand }) };
}

// Claude Opus 5.5 prices per million tokens (USD), for the cost shown to sales. Another model: tokens only.
const PRICE = { model: "claude-opus-5-5", input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20 };

function usageOf(response) {
  const u = response.usage || {};
  const t = {
    model: response.model,
    input: u.input_tokens || 0,
    cacheWrite: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    output: u.output_tokens || 0,
  };
  if (String(t.model).startsWith(PRICE.model)) {
    t.usd = Math.round(((t.input * PRICE.input + t.cacheWrite * PRICE.cacheWrite + t.cacheRead * PRICE.cacheRead + t.output * PRICE.output) / 1e6) * 1000) / 1000;
  }
  return t;
}

let client = null;
export const filmConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

/**
 * the demo's HTML -> { script: { scenes }, usage: { model, input, cacheWrite, cacheRead, output, usd? } }
 * fix: { script, failures: ["scene 2, action 1 (click .x): not found", ...] } to correct a script that did not play
 */
export async function writeFilm(html, { project = "", summary = "", fix = null } = {}) {
  if (!filmConfigured()) throw new HttpError(503, "ai_not_configured");
  const source = demoSource(html);
  client ||= new Anthropic({ timeout: 280_000, maxRetries: 0 });
  const ask = fix
    ? `This script was played and some actions failed:\n${fix.failures.slice(0, 40).join("\n")}\n\nThe script:\n${JSON.stringify(fix.script)}\n\nWrite the corrected film.`
    : "Write the film.";
  let response;
  try {
    response = await client.beta.messages.stream({
      model: process.env.ANTHROPIC_MODEL || MODEL,
      max_tokens: 32000,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{
        role: "user",
        content: [
          // the source first and cached, so a correction round reads it from the cache
          { type: "text", text: `<demo_source>\n${source}\n</demo_source>`, cache_control: { type: "ephemeral" } },
          { type: "text", text: `Project: ${s(project, 160)}${summary ? `\nAbout it: ${s(summary, 600)}` : ""}\n\n${ask}` },
        ],
      }],
    }).finalMessage();
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      console.error("[demo-film] key rejected:", err.message);
      throw new HttpError(503, "ai_not_configured");
    }
    if (err instanceof Anthropic.RateLimitError) throw new HttpError(503, "ai_busy");
    if (err instanceof Anthropic.APIError) {
      console.error(`[demo-film] API error ${err.status}:`, err.message);
      throw new HttpError(502, "ai_failed");
    }
    console.error("[demo-film] request failed:", err?.message || err);
    throw new HttpError(502, "ai_failed");
  }
  if (response.stop_reason === "refusal") throw new HttpError(422, "ai_refused");
  const text = response.content.find((b) => b.type === "text")?.text;
  let out;
  try {
    out = JSON.parse(text || "");
  } catch {
    console.error("[demo-film] not JSON, stop_reason:", response.stop_reason);
    throw new HttpError(502, "ai_failed");
  }
  const usage = usageOf(response);
  console.log("[demo-film] usage", JSON.stringify(usage));
  return { script: cleanScript(out), usage };
}

// ---- served with the demo ----

// Before the demo's own scripts: storage works in the sandboxed frame (it has no origin, so the real
// localStorage throws), and links never navigate the frame away from the demo. And the demo's clock: the
// film plays faster (like a video at 1.5x) by running the demo's own time faster, so its animations and the
// script's waits keep in step. Timers, animation frames, performance.now/Date.now and CSS animations follow
// window.__film.speed(k); 1 (the default) changes nothing.
const SHIM = `<script>(function(){var K=1,pn=performance.now.bind(performance),r0=pn(),v0=r0,ST=setTimeout,SI=setInterval,RAF=requestAnimationFrame,DN=Date.now;
function vn(){return v0+(pn()-r0)*K}
try{performance.now=function(){return vn()}}catch(e){}
Date.now=function(){return Math.round(DN()+(vn()-pn()))};
window.setTimeout=function(f,ms){var a=[].slice.call(arguments,2);return ST.apply(window,[f,(Number(ms)||0)/K].concat(a))};
window.setInterval=function(f,ms){var a=[].slice.call(arguments,2);return SI.apply(window,[f,Math.max(1,(Number(ms)||0)/K)].concat(a))};
window.requestAnimationFrame=function(cb){return RAF.call(window,function(){cb(vn())})};
function css(){try{document.getAnimations().forEach(function(a){var t=a.effect&&a.effect.target;if(!(t&&t.__film)&&a.playbackRate!==K)a.playbackRate=K})}catch(e){}}
SI.call(window,css,250);
window.__film={rt:function(f,ms){return ST.call(window,f,ms)},k:function(){return K},speed:function(k){v0=vn();r0=pn();K=k>0?k:1;css()}};})();
(function(){function M(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}
["localStorage","sessionStorage"].forEach(function(n){try{window[n].getItem("x")}catch(e){try{Object.defineProperty(window,n,{value:M(),configurable:true})}catch(e2){}}});
document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href]");if(a&&!/^#/.test(a.getAttribute("href")))e.preventDefault()},true);})();</script>`;

// Plays one action at a time on request from the page (postMessage { film, id, act }) and answers
// { film, id, ok, error }. The cursor and the click ripple are drawn here, inside the demo.
const DRIVER = `<script>(function(){
var P=window.parent,C,R,pos={x:${STAGE.w * 0.62},y:${STAGE.h * 0.55}};
var F=window.__film||{rt:function(f,ms){return setTimeout(f,ms)},k:function(){return 1},speed:function(){}};
function sleep(ms){return new Promise(function(r){F.rt(r,ms/F.k())})}
function rsleep(ms){return new Promise(function(r){F.rt(r,ms)})}
function vis(e){var r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=="hidden"&&s.display!=="none"&&Number(s.opacity)>0.02}
function find(sel,text){var l;try{l=[].slice.call(document.querySelectorAll(sel))}catch(e){throw new Error("bad selector")}
if(text)l=l.filter(function(e){return(e.textContent||e.value||"").replace(/\\s+/g," ").indexOf(text)>=0});
var v=l.filter(vis);if(text&&v.length>1){v.sort(function(a,b){return a.textContent.length-b.textContent.length})}
var e=v[0];if(!e)throw new Error(l.length?"not visible":"not found");return e}
function cursor(){if(C&&C.isConnected)return;C=document.createElement("div");C.setAttribute("aria-hidden","true");
C.style.cssText="position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transition:transform .7s cubic-bezier(.45,.05,.25,1);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))";
C.innerHTML='<svg width="26" height="26" viewBox="0 0 26 26"><path d="M3 2l17 9.5-7.2 1.6L9.6 20z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
C.__film=1;document.documentElement.appendChild(C);place(0)}
function place(ms){C.style.transitionDuration=Math.round(ms/F.k())+"ms";C.style.transform="translate("+(pos.x-3)+"px,"+(pos.y-2)+"px)"}
function center(e){var r=e.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}}
async function glide(p){cursor();var d=Math.hypot(p.x-pos.x,p.y-pos.y),ms=Math.round(Math.min(950,Math.max(320,d*1.1)));pos={x:p.x,y:p.y};place(ms);await sleep(ms+60)}
async function reach(e){if(!inView(e)){e.scrollIntoView({block:"center",inline:"nearest",behavior:"smooth"});await rsleep(650)}await glide(center(e))}
function inView(e){var r=e.getBoundingClientRect();return r.top>=8&&r.bottom<=innerHeight-8&&r.left>=0&&r.right<=innerWidth}
function ripple(){var d=document.createElement("div");d.style.cssText="position:fixed;z-index:2147483646;pointer-events:none;left:"+(pos.x-18)+"px;top:"+(pos.y-18)+"px;width:36px;height:36px;border-radius:50%;background:rgba(80,110,255,.35);transform:scale(.3);opacity:1;transition:transform .45s ease-out,opacity .45s ease-out";d.__film=1;document.documentElement.appendChild(d);F.rt(function(){d.style.transform="scale(1.6)";d.style.opacity="0"},20);F.rt(function(){d.remove()},540)}
function fire(e,type,p,extra){var o=Object.assign({bubbles:true,cancelable:true,composed:true,view:window,clientX:p.x,clientY:p.y,button:0,buttons:/down|move/.test(type)?1:0,pointerId:1,pointerType:"mouse",isPrimary:true},extra||{});
var E=/^pointer/.test(type)&&window.PointerEvent?PointerEvent:MouseEvent;e.dispatchEvent(new E(type,o))}
function at(p,fallback){var t=document.elementFromPoint(p.x,p.y);return t&&(t===fallback||fallback.contains(t)||t.contains(fallback))?t:fallback}
async function click(e){await reach(e);var p=center(e),t=at(p,e);ripple();fire(t,"pointerover",p);fire(t,"mouseover",p);fire(t,"pointerdown",p);fire(t,"mousedown",p);if(t.focus)try{t.focus({preventScroll:true})}catch(x){}await sleep(90);fire(t,"pointerup",p);fire(t,"mouseup",p);fire(t,"click",p);await sleep(120)}
function setVal(e,v){var pr=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;var d=Object.getOwnPropertyDescriptor(pr,"value");d&&d.set?d.set.call(e,v):(e.value=v)}
async function type(e,v){await click(e);setVal(e,"");e.dispatchEvent(new Event("input",{bubbles:true}));for(var i=0;i<v.length;i++){setVal(e,v.slice(0,i+1));e.dispatchEvent(new InputEvent("input",{bubbles:true,data:v[i],inputType:"insertText"}));await sleep(45+Math.random()*55)}e.dispatchEvent(new Event("change",{bubbles:true}))}
async function drag(e,a){await reach(e);var p=center(e),q=a.to?center(find(a.to)):{x:p.x+(a.dx||0),y:p.y+(a.dy||0)};ripple();fire(e,"pointerdown",p);fire(e,"mousedown",p);
var steps=24;for(var i=1;i<=steps;i++){var k=i/steps,m={x:p.x+(q.x-p.x)*k,y:p.y+(q.y-p.y)*k};pos=m;place(0);var t=document.elementFromPoint(m.x,m.y)||e;fire(t,"pointermove",m);fire(t,"mousemove",m);await sleep(28)}
var u=document.elementFromPoint(q.x,q.y)||e;fire(u,"pointerup",q);fire(u,"mouseup",q);if(e.setPointerCapture)fire(e,"pointerup",q);await sleep(150)}
function scroller(e){for(var n=e;n&&n!==document.body;n=n.parentElement){var s=getComputedStyle(n);if(/(auto|scroll)/.test(s.overflowY)&&n.scrollHeight>n.clientHeight)return n}return null}
async function ring(e,ms){var r=e.getBoundingClientRect(),d=document.createElement("div");d.style.cssText="position:fixed;z-index:2147483645;pointer-events:none;left:"+(r.left-6)+"px;top:"+(r.top-6)+"px;width:"+(r.width+12)+"px;height:"+(r.height+12)+"px;border-radius:10px;box-shadow:0 0 0 3px rgba(255,196,0,.95),0 0 24px 6px rgba(255,196,0,.35);opacity:0;transition:opacity .3s";d.__film=1;document.documentElement.appendChild(d);F.rt(function(){d.style.opacity="1"},20);await sleep(ms||1400);d.style.opacity="0";F.rt(function(){d.remove()},340)}
async function run(a){switch(a.do){
case"wait":return sleep(a.ms||800);
case"click":return click(find(a.selector,a.text));
case"hover":{var h=find(a.selector,a.text);await reach(h);var hp=center(h);fire(h,"pointerover",hp);fire(h,"mouseover",hp);fire(h,"mouseenter",hp);return sleep(300)}
case"type":return type(find(a.selector,a.text),a.value||"");
case"select":{var s=find(a.selector,a.text);await reach(s);ripple();setVal(s,a.value||"");s.dispatchEvent(new Event("input",{bubbles:true}));s.dispatchEvent(new Event("change",{bubbles:true}));return sleep(250)}
case"drag":return drag(find(a.selector,a.text),a);
case"scroll":{if(a.selector){var t=find(a.selector,a.text);t.scrollIntoView({block:"center",behavior:"smooth"});return rsleep(650)}var el=document.elementFromPoint(pos.x,pos.y),sc=el&&scroller(el);(sc||window).scrollBy({top:a.dy||300,behavior:"smooth"});return rsleep(650)}
case"key":{var f=document.activeElement||document.body;["keydown","keyup"].forEach(function(k){f.dispatchEvent(new KeyboardEvent(k,{key:a.value,bubbles:true,cancelable:true}))});return sleep(200)}
case"highlight":{var g=find(a.selector,a.text);if(!inView(g)){g.scrollIntoView({block:"center",behavior:"smooth"});await rsleep(600)}return ring(g,a.ms)}
case"zoom":{var z=find(a.selector,a.text);if(!inView(z)){z.scrollIntoView({block:"center",behavior:"smooth"});await rsleep(600)}var r=z.getBoundingClientRect();return{rect:{x:r.left,y:r.top,w:r.width,h:r.height}}}
case"zoomOut":return;
case"speed":F.speed(Number(a.value)||1);return;
case"brand":return brand(a);
default:throw new Error("unknown action")}}
function attr(e){return [e.getAttribute("src"),e.getAttribute("alt"),e.getAttribute("class"),e.id,e.parentElement&&e.parentElement.getAttribute("class"),e.parentElement&&e.parentElement.id].join(" ")}
function brandEl(a){if(a.selector){try{return find(a.selector,a.text)}catch(x){}}
var l=[].slice.call(document.querySelectorAll("img,svg,[class*=logo i],[id*=logo i],[class*=brand i],[id*=brand i]"));
l=l.filter(function(e){if(e.__film||!vis(e))return false;var r=e.getBoundingClientRect();if(r.top>150||r.height>90||r.width>380)return false;var t=e.tagName.toLowerCase();return(t!=="img"&&t!=="svg")||/logo|brand/i.test(attr(e))});return l[0]||null}
function lum(c){var m=/rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?/.exec(c||"");if(!m||(m[4]!==undefined&&Number(m[4])<0.5))return null;return(0.2126*m[1]+0.7152*m[2]+0.0722*m[3])/255}
function bgLum(e){for(var n=e;n&&n.nodeType===1;n=n.parentElement){var v=lum(getComputedStyle(n).backgroundColor);if(v!==null)return v}return 1}
var B=null,BO=null;
function brand(a){var e=brandEl(a);if(!e)throw new Error(a.selector?"not found":"no place for the logo");
var r=e.getBoundingClientRect(),t=e.tagName.toLowerCase(),mode=a.place||(t==="img"||t==="svg"?"replace":"start");
var h=Math.round(Math.min(52,Math.max(22,mode==="replace"?r.height:Math.min(r.height-4,36))));
var dark=bgLum(e.parentElement||e)<0.45,L=a.logo||{},fx="";
if(L.transparent){if(dark&&L.ink<0.5)fx="filter:brightness(0) invert(1);";else if(!dark&&L.ink>0.82)fx="filter:brightness(0);opacity:.85;"}
else if(!dark&&L.whiteBg)fx="mix-blend-mode:multiply;";else fx="border-radius:"+Math.round(h/5)+"px;";
var css="height:"+h+"px;width:auto;max-width:"+Math.round(Math.max(110,Math.min(240,h*5)))+"px;object-fit:contain;display:inline-block;vertical-align:middle;flex:none;"+fx;
var img;if(mode==="replace"&&t==="img"){img=e;img.removeAttribute("srcset");img.src=a.src;img.style.cssText+=";"+css}
else{img=document.createElement("img");img.src=a.src;img.alt="";img.style.cssText=css;
if(mode==="replace"){e.style.display="none";e.parentNode.insertBefore(img,e)}else{img.style.marginInlineEnd=Math.round(h/3)+"px";e.insertBefore(img,e.firstChild)}}
img.setAttribute("data-film-brand","");B=a;
if(!BO&&window.MutationObserver){BO=new MutationObserver(function(){if(B&&!document.querySelector("[data-film-brand]")){try{brand(B)}catch(x){}}});BO.observe(document.body,{childList:true,subtree:true})}}
addEventListener("message",async function(ev){var m=ev.data;if(!m||m.film!==1||ev.source!==P)return;
if(m.hello){P.postMessage({film:1,ready:true},"*");return}
try{var r=await run(m.act||{});P.postMessage({film:1,id:m.id,ok:true,rect:r&&r.rect||null},"*")}catch(e){P.postMessage({film:1,id:m.id,ok:false,error:String(e&&e.message||e)},"*")}});
function ready(){P.postMessage({film:1,ready:true},"*")}
document.readyState==="complete"?ready():addEventListener("load",ready);
})();</script>`;

/** the demo's HTML -> the same page with the shim at the top and the driver at the end */
export function withDriver(html) {
  const head = /<head[^>]*>/i.exec(html);
  let out = head ? html.slice(0, head.index + head[0].length) + SHIM + html.slice(head.index + head[0].length) : SHIM + html;
  const end = out.toLowerCase().lastIndexOf("</body>");
  out = end >= 0 ? out.slice(0, end) + DRIVER + out.slice(end) : out + DRIVER;
  return out;
}
