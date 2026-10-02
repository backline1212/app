import { type PointerEvent as ReactPointerEvent, useRef } from "react";

import type { OrgLayout } from "./layout";
import type { Camera } from "./use-camera";

const MAP_W = 168;
const MAP_H = 104;

interface MiniMapProps {
  layout: OrgLayout;
  camera: Camera;
  stageSize: () => { w: number; h: number };
  isDim: (userId: string) => boolean;
  selectedUserId: string | null;
  onNavigate: (worldPoint: { x: number; y: number }) => void;
}

/** The whole chart in miniature, with the visible area outlined. Click or drag in it
 * to move there. Hidden from assistive tech: the tree itself is the accessible view. */
export function MiniMap({ layout, camera, stageSize, isDim, selectedUserId, onNavigate }: MiniMapProps) {
  const ref = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const pad = 40;
  const worldW = layout.width + pad * 2;
  const worldH = layout.height + pad * 2;
  const scale = Math.min(MAP_W / worldW, MAP_H / worldH);
  const { w, h } = stageSize();
  const view = {
    x: (-camera.x / camera.k + pad) * scale,
    y: (-camera.y / camera.k + pad) * scale,
    w: (w / camera.k) * scale,
    h: (h / camera.k) * scale,
  };

  function navigate(event: ReactPointerEvent<SVGSVGElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    onNavigate({
      x: (event.clientX - rect.left) / scale - pad,
      y: (event.clientY - rect.top) / scale - pad,
    });
  }

  return (
    <svg
      ref={ref}
      className="org-ui org-minimap"
      width={MAP_W}
      height={MAP_H}
      viewBox={`0 0 ${MAP_W} ${MAP_H}`}
      aria-hidden="true"
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        navigate(event);
      }}
      onPointerMove={(event) => dragging.current && navigate(event)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      {layout.nodes.map((node) => (
        <rect
          key={node.id}
          x={(node.x + pad) * scale}
          y={(node.y + pad) * scale}
          width={Math.max(2, node.w * scale)}
          height={Math.max(2, node.h * scale)}
          rx={1.5}
          className={
            node.kind === "root"
              ? "mm-root"
              : node.id === selectedUserId
                ? "mm-selected"
                : isDim(node.id)
                  ? "mm-dim"
                  : "mm-node"
          }
        />
      ))}
      <rect className="mm-view" x={view.x} y={view.y} width={Math.max(4, view.w)} height={Math.max(4, view.h)} rx={2} />
    </svg>
  );
}
