"use client";
import { Component, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { LiveIntro, LiveMember } from "@/lib/mocks";
import { firstName } from "@/lib/ui";

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

function PlainList({ members, intros }: { members: LiveMember[]; intros: LiveIntro[] }) {
  const byId = new Map(members.map((m) => [m.id, m]));
  return (
    <ul className="h-full space-y-2 overflow-auto p-4 text-xl">
      {intros.map((i) => (
        <li key={`${i.a_id}-${i.b_id}`}>
          {byId.get(i.a_id)?.name ?? "?"} ↔ {byId.get(i.b_id)?.name ?? "?"}
        </li>
      ))}
    </ul>
  );
}

export function Graph({ members, intros }: { members: LiveMember[]; intros: LiveIntro[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 400 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Keep node objects stable across polls so the simulation doesn't restart on every refresh.
  const cache = useRef(new Map<string, Node>());
  const data = useMemo(() => {
    const deg = new Map<string, number>();
    for (const i of intros) {
      deg.set(i.a_id, (deg.get(i.a_id) ?? 0) + 1);
      deg.set(i.b_id, (deg.get(i.b_id) ?? 0) + 1);
    }
    const nodes = members.map((m) => {
      let n = cache.current.get(m.id);
      if (!n) {
        n = { id: m.id, name: firstName(m.name), deg: 0 };
        cache.current.set(m.id, n);
      }
      n.deg = deg.get(m.id) ?? 0;
      return n;
    });
    const ids = new Set(nodes.map((n) => n.id));
    const links: Link[] = intros.filter((i) => ids.has(i.a_id) && ids.has(i.b_id)).map((i) => ({ source: i.a_id, target: i.b_id }));
    return { nodes, links };
  }, [members, intros]);

  return (
    <div ref={ref} className="h-full w-full">
      <Boundary fallback={<PlainList members={members} intros={intros} />}>
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
  );
}
