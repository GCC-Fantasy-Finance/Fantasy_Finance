import DraftHeader from "../../../layouts/components/DraftHeader";
import DraftResultsPanel from "../../../layouts/components/DraftResultsPanel";
import DraftSearchPanel from "../../../layouts/components/DraftSearchPanel";
import DraftQueuePanel from "../../../layouts/components/DraftQueuePanel";
import { DraftProvider, useDraft } from "../../../context/DraftContext";
import { useRef, useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import StockDetailsModal from "@/components/ui/stockDetailsModal";
import { getStockById } from "@/lib/stocks";
import PostDraftModal from "@/components/ui/PostDraftModal";

// Inner component that uses useDraft
const DraftPageContent = () => {
  const {
    showPostDraftModal,
    setShowPostDraftModal,
    draftedStockIds,
    myPortfolio,
  } = useDraft();

  // Modal state (store full stock object)
  const [selectedStock, setSelectedStock] = useState<any | null>(null);

  // Panel sizes
  const [topHeight, setTopHeight] = useState(35);
  const [leftWidth, setLeftWidth] = useState(80);

  const draggingVert = useRef(false);
  const draggingHorz = useRef(false);
  const vertClickOffset = useRef(0);

  /* ================= VERTICAL DRAG ================= */
  const onVertMouseDown = (e: React.MouseEvent) => {
    draggingVert.current = true;
    document.body.style.cursor = "row-resize";

    const divider = e.currentTarget as HTMLDivElement;
    vertClickOffset.current = e.clientY - divider.getBoundingClientRect().top;
  };

  const onVertMouseMove = (e: MouseEvent) => {
    if (!draggingVert.current) return;
    const container = document.getElementById("draft-container");
    const header = document.getElementById("draft-header");
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const headerHeight = header ? header.offsetHeight : 0;

    let newTop =
      e.clientY - containerRect.top - headerHeight - vertClickOffset.current;

    const maxContentHeight = containerRect.height - headerHeight;
    newTop = Math.max(60, Math.min(maxContentHeight * 0.85, newTop));

    const percent = (newTop / maxContentHeight) * 100;
    setTopHeight(percent);
  };

  const stopVertDrag = () => {
    draggingVert.current = false;
    document.body.style.cursor = "";
  };

  /* ================= HORIZONTAL DRAG ================= */
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

  const stopHorzDrag = () => {
    draggingHorz.current = false;
    document.body.style.cursor = "";
  };

  /* ================= GLOBAL MOUSE EVENTS ================= */
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      onVertMouseMove(e);
      onHorzMouseMove(e);
    };

    const handleUp = () => {
      stopVertDrag();
      stopHorzDrag();
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, []);

  // ⭐ Helper for panels to open modal by stockId
  const handleStockClick = async (stockId: number) => {
    const stock = await getStockById(stockId);
    if (stock) setSelectedStock(stock);
  };

  return (
    <div
      id="draft-container"
      className="h-screen flex flex-col overflow-hidden"
    >
      <div id="draft-header">
        <DraftHeader />
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {/* TOP PANEL */}
        <div
          style={{ height: `${topHeight}%` }}
          className="min-h-[60px] overflow-auto border-b border-gray-200"
        >
          <DraftResultsPanel onStockClick={handleStockClick} />
        </div>

        {/* VERTICAL RESIZER */}
        <div
          onMouseDown={onVertMouseDown}
          className="relative h-px bg-gray-200 cursor-row-resize group"
        >
          <div className="absolute inset-x-0 -top-1.5 h-3" />
        </div>

        {/* BOTTOM PANELS */}
        <div id="bottom-panels" className="flex flex-1 min-h-0 relative">
          {/* LEFT PANEL */}
          <div
            style={{ width: `${leftWidth}%` }}
            className="min-w-[120px] border-r border-gray-200 overflow-hidden"
          >
            <DraftSearchPanel onStockClick={handleStockClick} />
          </div>

          {/* HORIZONTAL RESIZER */}
          <div
            onMouseDown={onHorzMouseDown}
            className="relative w-px bg-gray-200 cursor-col-resize group"
          >
            <div className="absolute inset-y-0 -left-1.5 w-3" />
          </div>

          {/* RIGHT PANEL */}
          <div className="flex-1 min-w-[120px] overflow-auto">
            <DraftQueuePanel onStockClick={handleStockClick} />
          </div>
        </div>
      </div>

      {/* GLOBAL STOCK MODAL FOR DRAFT ROOM */}
      <StockDetailsModal
        open={selectedStock !== null}
        stock={selectedStock}
        onClose={() => setSelectedStock(null)}
      />

      {/* POST-DRAFT BUY MODAL */}
      <PostDraftModal
        open={showPostDraftModal}
        draftedStockIds={draftedStockIds}
        portfolioId={myPortfolio?.portfolio_id ?? 0}
        onClose={() => setShowPostDraftModal(false)}
        onStockClick={handleStockClick}
      />
    </div>
  );
};

// Outer component that wraps with provider
const DraftPage = () => {
  const { leagueId } = useParams<{ leagueId: string }>();

  if (!leagueId) return <div>Invalid league</div>;

  const parsedLeagueId = Number(leagueId);
  if (Number.isNaN(parsedLeagueId)) return <div>Invalid league ID</div>;

  return (
    <DraftProvider leagueId={parsedLeagueId}>
      <DraftPageContent />
    </DraftProvider>
  );
};

export default DraftPage;
