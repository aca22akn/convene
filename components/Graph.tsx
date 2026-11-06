"use client";
import { Component, useEffect, useId, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { LiveIntro, LiveMember } from "@/lib/mocks";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

type Node = { id: string; name: string; deg: number };
type Link = { source: string; target: string };

class Boundary extends Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function PlainList({ members, intros, id, className, focusable }: { members: LiveMember[]; intros: LiveIntro[]; id: string; className: string; focusable: boolean }) {
  const byId = new Map(members.map((m) => [m.id, m]));
  return (
    <ul id={id} aria-label="Introduction list" tabIndex={focusable ? 0 : undefined} className={`space-y-2 text-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-inset ${className}`}>
      {intros.map((i) => (
        <li key={`${i.a_id}-${i.b_id}`}>
          {byId.get(i.a_id)?.display_name ?? "?"} ↔ {byId.get(i.b_id)?.display_name ?? "?"} <span className="text-white/45">·</span> {i.headline}
        </li>
      ))}
      {intros.length === 0 && <li>No introductions yet.</li>}
    </ul>
  );
}

export function Graph({ members, intros }: { members: LiveMember[]; intros: LiveIntro[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 400 });
  const [listVisible, setListVisible] = useState(false);
  const listId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => {
    const deg = new Map<string, number>();
    for (const i of intros) {
      deg.set(i.a_id, (deg.get(i.a_id) ?? 0) + 1);
      deg.set(i.b_id, (deg.get(i.b_id) ?? 0) + 1);
    }
    const nodes = members.map((m) => ({ id: m.id, name: m.display_name, deg: deg.get(m.id) ?? 0 }));
    const ids = new Set(nodes.map((n) => n.id));
    const links: Link[] = intros.filter((i) => ids.has(i.a_id) && ids.has(i.b_id)).map((i) => ({ source: i.a_id, target: i.b_id }));
    return { nodes, links };
  }, [members, intros]);

  const people = `${members.length} ${members.length === 1 ? "person" : "people"}`;
  const introductions = `${intros.length} ${intros.length === 1 ? "introduction" : "introductions"}`;

  return (
    <div ref={ref} className="relative h-full w-full">
      <div role="img" aria-label={`${people}, ${introductions}`} aria-hidden={listVisible} className="h-full w-full">
        <Boundary fallback={<PlainList id={listId} members={members} intros={intros} focusable className="h-full overflow-y-auto p-4" />}>
          <ForceGraph2D
            width={size.w}
            height={size.h}
            graphData={data}
            backgroundColor="rgba(0,0,0,0)"
            linkColor={() => "rgba(52,211,153,0.55)"}
            linkWidth={2.5}
            cooldownTicks={120}
            nodeCanvasObject={(node, ctx, scale) => {
              const n = node as Node & { x?: number; y?: number };
              if (n.x == null || n.y == null) return;
              const r = 6 + n.deg * 2;
              ctx.beginPath();
              ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
              ctx.fillStyle = n.deg > 0 ? "#34d399" : "#64748b";
              ctx.fill();
              const fs = Math.max(14 / scale, 4);
              ctx.font = `600 ${fs}px sans-serif`;
              ctx.fillStyle = "#f4f4f6";
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillText(n.name, n.x, n.y + r + 2);
            }}
          />
        </Boundary>
      </div>
      <button
        type="button"
        aria-controls={listId}
        aria-pressed={listVisible}
        onClick={() => setListVisible((visible) => !visible)}
        className="absolute right-3 top-3 z-20 rounded-lg border border-white/30 bg-background px-3 py-2 text-sm font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-400"
      >
        List view
      </button>
      <PlainList
        id={listId}
        members={members}
        intros={intros}
        focusable={listVisible}
        className={listVisible ? "absolute inset-0 z-10 h-full overflow-y-auto bg-background p-4 pr-24" : "sr-only"}
      />
    </div>
  );
}
