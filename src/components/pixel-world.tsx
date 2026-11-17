"use client";

import type { Agent, AgentId, AgentStatus } from "@/lib/world";

// Pixel office from V3, restyled as a space station: every shape is a <rect>; neighbouring pixels in a row
// are merged so one character is a handful of rects, not hundreds.

type Rect = { x: number; y: number; w: number; h: number; f: string; anim?: string };
const BODY = ["..hhhh..", ".hhhhhh.", ".hsssshh", ".seseseh", ".ssssss.", "..smms..", ".cccccc.", "cccaaccc", "sccaaccs", ".cccccc."];
const LOOK: Record<AgentId, [string, string, string]> = {
  head: ["#2b2b36", "#3a3f8f", "#e8703a"], meter: ["#6b3e1f", "#2f9e6d", "#ffd166"], billing: ["#1f1f28", "#e8703a", "#ffffff"],
  line: ["#3b2a4a", "#06c755", "#ffffff"], collect: ["#8a4b2a", "#d9503f", "#ffd166"], repair: ["#3a2a1a", "#4cc9f0", "#22222a"],
  lease: ["#c9c9d1", "#7c5cd6", "#ffffff"], rooms: ["#d9824b", "#f472b6", "#ffffff"], accy: ["#4a3426", "#e0b52f", "#22222a"],
};
const CELL: Record<AgentId, [number, number, number, number]> = {
  head: [62, 22, 76, 44], meter: [4, 22, 54, 44], billing: [142, 22, 54, 44],
  line: [4, 72, 60, 44], collect: [70, 72, 60, 44], repair: [136, 72, 60, 44],
  lease: [4, 122, 60, 44], rooms: [70, 122, 60, 44], accy: [136, 122, 60, 44],
};
const SCREEN: Record<AgentStatus, [string, string]> = { idle: ["#0f3d2e", "#5dd39e"], waiting: ["#1b2250", "#8fa3ff"], busy: ["#3d2a10", "#ffd166"], alert: ["#4a0f1a", "#ff5a5a"] };
const BUBBLE: Record<AgentStatus, string | null> = { idle: null, waiting: "#8fa3ff", busy: "#ffd166", alert: "#ff5a5a" };
const BLINK = "ea-blink .8s steps(1) infinite", FLOAT = "ea-float 2.4s ease-in-out infinite";

function scene(agents: Agent[], selected: AgentId) {
  const r: Rect[] = [], t: { x: number; y: number; s: string; f: string; size: number; anchor?: "middle" }[] = [];
  const R = (x: number, y: number, w: number, h: number, f: string, anim?: string) => r.push({ x, y, w, h, f, anim });
  const PX = (rows: string[], pal: Record<string, string>, x: number, y: number, anim?: string) => rows.forEach((row, ry) => {
    let a = 0;
    for (let i = 1; i <= row.length; i++) { if (i < row.length && row[i] === row[a]) continue; const f = pal[row[a]]; if (f) R(x + a, y + ry, i - a, 1, f, anim); a = i; }
  });
  R(0, 0, 200, 172, "#060a24");
  for (let i = 0; i <= 20; i++) R(i * 10, 18, 1, 154, "#0d1645");
  for (let j = 0; j < 16; j++) R(0, 18 + j * 10, 200, 1, "#0d1645");
  R(0, 0, 200, 18, "#0b0f33"); R(0, 16, 200, 2, "#3a8fb0");
  for (const [x, c] of [[10, "#2a6f8a"], [30, "#4a3f8f"], [158, "#4a3f8f"], [178, "#2a6f8a"]] as const) { R(x, 4, 12, 9, "#141c55"); R(x + 1, 5, 10, 7, c); R(x + 3, 7, 2, 1, "#ffffff"); }
  R(64, 3, 72, 11, "#141c55"); R(64, 13, 72, 1, "#6ee7ff");
  t.push({ x: 100, y: 11, s: "W WORLD", f: "#6ee7ff", size: 6.5, anchor: "middle" });
  for (const g of agents) {
    const [x, y, w, h] = CELL[g.id]; const on = g.id === selected;
    R(x, y, w, h, on ? "#152060" : "#0c1340");
    const edge = on ? "#6ee7ff" : "#2b3a8f", anim = on ? "ea-blink 1.2s steps(1) infinite" : undefined;
    R(x, y, w, 1, edge, anim); R(x, y + h - 1, w, 1, edge, anim); R(x, y, 1, h, edge, anim); R(x + w - 1, y, 1, h, edge, anim);
    R(x + 3, y + 3, g.name.length * 4 + 4, 7, "#6ee7ff");
    t.push({ x: x + 5, y: y + 8.6, s: g.name, f: "#060a24", size: 5 });
    const cx = x + w / 2 - 14, dy = y + 22, [hair, shirt, acc] = LOOK[g.id];
    PX(BODY, { h: hair, s: "#f6c9a0", e: "#1b1240", m: "#c2410c", c: shirt, a: acc }, cx + 5, dy - 8, FLOAT);
    const [bg, fg] = SCREEN[g.status];
    R(cx + 17, dy - 3, 11, 9, "#2a2a45"); R(cx + 18, dy - 2, 9, 7, bg); R(cx + 20, dy, 5, 1, fg, g.status === "alert" ? BLINK : undefined); R(cx + 20, dy + 2, 3, 1, fg);
    R(cx + 21, dy + 6, 3, 2, "#2a2a45"); R(cx, dy + 8, 28, 3, "#3a4a9a"); R(cx, dy + 11, 28, 6, "#222d70"); R(cx, dy + 8, 28, 1, "#4f8fc0"); R(cx + 3, dy + 5, 3, 3, "#e8ecff");
    const bub = BUBBLE[g.status];
    if (bub) {
      R(cx + 20, y + 3, 10, 8, "#ffffff", g.status === "alert" ? BLINK : FLOAT); R(cx + 21, y + 11, 2, 2, "#ffffff");
      t.push({ x: cx + 25, y: y + 9.4, s: g.status === "alert" ? "!" : g.status === "waiting" ? "zz" : String(Math.min(g.count, 9)), f: bub === "#ffd166" ? "#7a4a00" : bub, size: 6.5, anchor: "middle" });
    }
  }
  return { r, t };
}

export default function PixelWorld({ agents, selected, onSelect }: { agents: Agent[]; selected: AgentId; onSelect: (id: AgentId) => void }) {
  const { r, t } = scene(agents, selected);
  return (
    <div className="relative overflow-hidden rounded-[20px] ring-1 ring-[rgba(110,231,255,.35)] shadow-[0_0_30px_rgba(110,231,255,.15)]">
      <svg viewBox="0 0 200 172" className="block w-full" shapeRendering="crispEdges" role="img" aria-label="ออฟฟิศพิกเซลของพนักงาน W World">
        {r.map((x, i) => <rect key={i} x={x.x} y={x.y} width={x.w} height={x.h} fill={x.f} style={x.anim ? { animation: x.anim } : undefined} />)}
        {t.map((x, i) => <text key={`t${i}`} x={x.x} y={x.y} fill={x.f} fontSize={x.size} fontWeight={800} fontFamily="ui-monospace, monospace" textAnchor={x.anchor}>{x.s}</text>)}
      </svg>
      {agents.map((g) => {
        const [x, y, w, h] = CELL[g.id];
        return <button key={g.id} onClick={() => onSelect(g.id)} aria-pressed={g.id === selected} aria-label={`${g.name} ${g.role}: ${g.summary}`}
          className="absolute" style={{ left: `${(x / 200) * 100}%`, top: `${(y / 172) * 100}%`, width: `${(w / 200) * 100}%`, height: `${(h / 172) * 100}%` }} />;
      })}
    </div>
  );
}
