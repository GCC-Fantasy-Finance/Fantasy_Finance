import DraftHeader from "../../../layouts/components/DraftHeader";
import DraftResultsPanel from "../../../layouts/components/DraftResultsPanel";
import DraftSearchPanel from "../../../layouts/components/DraftSearchPanel";
import DraftQueuePanel from "../../../layouts/components/DraftQueuePanel";
import { DraftProvider } from "../../../context/DraftContext";
import { useRef, useState } from "react";

const DraftPage = () => {
  const [topHeight, setTopHeight] = useState(50); // percent
  const draggingVert = useRef(false);

  const [leftWidth, setLeftWidth] = useState(66.66); // percent
  const draggingHorz = useRef(false);

  const onVertMouseDown = () => {
    draggingVert.current = true;
    document.body.style.cursor = "row-resize";
  };
  const onVertMouseMove = (e: MouseEvent) => {
    if (!draggingVert.current) return;
    const container = document.getElementById("draft-container");
    if (!container) return;
    const rect = container.getBoundingClientRect();
    let percent = ((e.clientY - rect.top) / rect.height) * 100;
    percent = Math.max(10, Math.min(90, percent));
    setTopHeight(percent);
  };
  const onVertMouseUp = () => {
    draggingVert.current = false;
    document.body.style.cursor = "";
  };

  const onHorzMouseDown = () => {
    draggingHorz.current = true;
    document.body.style.cursor = "col-resize";
  };
  const onHorzMouseMove = (e: MouseEvent) => {
    if (!draggingHorz.current) return;
    const container = document.getElementById("bottom-panels");
    if (!container) return;
    const rect = container.getBoundingClientRect();
    let percent = ((e.clientX - rect.left) / rect.width) * 100;
    percent = Math.max(20, Math.min(80, percent));
    setLeftWidth(percent);
  };
  const onHorzMouseUp = () => {
    draggingHorz.current = false;
    document.body.style.cursor = "";
  };

  if (typeof window !== "undefined") {
    window.onmousemove = (e) => {
      onVertMouseMove(e as MouseEvent);
      onHorzMouseMove(e as MouseEvent);
    };
    window.onmouseup = () => {
      onVertMouseUp();
      onHorzMouseUp();
    };
  }

  return (
    <DraftProvider>
      <div
        id="draft-container"
        style={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          userSelect: draggingVert.current || draggingHorz.current ? "none" : "auto",
        }}
      >
        <DraftHeader />

        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div
            style={{
              height: `calc(${topHeight}% - 2px)`,
              minHeight: 40,
              borderBottom: "1px solid #eee",
              overflow: "auto",
            }}
          >
            <DraftResultsPanel />
          </div>
          <div
            style={{
              height: 4,
              cursor: "row-resize",
              background: "#f2f2f2",
              borderBottom: "1px solid #eee",
              zIndex: 2,
            }}
            onMouseDown={onVertMouseDown}
          />
          <div
            id="bottom-panels"
            style={{
              flex: 1,
              display: "flex",
              minHeight: 0,
              position: "relative",
            }}
          >
            <div
              style={{
                width: `calc(${leftWidth}% - 2px)`,
                minWidth: 80,
                borderRight: "1px solid #eee",
                overflow: "auto",
              }}
            >
              <DraftSearchPanel />
            </div>
            <div
              style={{
                width: 4,
                cursor: "col-resize",
                background: "#f2f2f2",
                zIndex: 2,
              }}
              onMouseDown={onHorzMouseDown}
            />
            <div
              style={{
                flex: 1,
                minWidth: 40,
                overflow: "auto",
              }}
            >
              <DraftQueuePanel />
            </div>
          </div>
        </div>
      </div>
    </DraftProvider>
  );
};

export default DraftPage;