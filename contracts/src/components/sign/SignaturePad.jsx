import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Eraser } from "lucide-react";

const SignaturePad = forwardRef(function SignaturePad(_, ref) {
  const canvas = useRef(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current;
    const r = c.getBoundingClientRect();
    c.width = r.width * 2;
    c.height = r.height * 2;
    const ctx = c.getContext("2d");
    ctx.scale(2, 2);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1c1917";
  }, []);

  const pos = (e) => { const r = canvas.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const start = (e) => { drawing.current = true; const ctx = canvas.current.getContext("2d"); ctx.beginPath(); ctx.moveTo(...pos(e)); };
  const draw = (e) => { if (!drawing.current) return; const ctx = canvas.current.getContext("2d"); ctx.lineTo(...pos(e)); ctx.stroke(); setEmpty(false); };
  const end = () => { drawing.current = false; };
  const clear = () => { const c = canvas.current; c.getContext("2d").clearRect(0, 0, c.width, c.height); setEmpty(true); };

  useImperativeHandle(ref, () => ({
    isEmpty: () => empty,
    clear,
    toBlob: () => new Promise((res) => canvas.current.toBlob(res, "image/png")),
  }), [empty]);

  return (
    <div className="relative">
      <canvas
        ref={canvas}
        onPointerDown={start} onPointerMove={draw} onPointerUp={end} onPointerLeave={end}
        className="h-44 w-full cursor-crosshair touch-none rounded-xl border border-dashed border-border bg-white"
      />
      {empty && <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted-foreground">חתמו כאן באצבע או בעכבר</span>}
      <button type="button" onClick={clear} title="ניקוי" className="absolute left-2 top-2 rounded-lg bg-secondary p-1.5 text-muted-foreground hover:text-foreground">
        <Eraser className="h-4 w-4" />
      </button>
    </div>
  );
});

export default SignaturePad;