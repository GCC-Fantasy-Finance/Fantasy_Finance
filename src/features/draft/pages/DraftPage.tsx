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

const COMPACT_BOTTOM_BREAKPOINT = 850;

// Inner component that uses useDraft
const DraftPageContent = () => {
  const {
    showPostDraftModal,
    setShowPostDraftModal,
    draftedStockIds,
    myPortfolio,
    draftEnded,
  } = useDraft();

  // Modal state (store full stock object)
  const [selectedStock, setSelectedStock] = useState<any | null>(null);

  // Panel sizes
  const [topHeight, setTopHeight] = useState(35);
  const [queueWidth, setQueueWidth] = useState(400);
  const [isCompactBottomPanels, setIsCompactBottomPanels] = useState(false);
  const [activeBottomTab, setActiveBottomTab] = useState<"search" | "queue">(
    "search",
  );

  const draftContainerRef = useRef<HTMLDivElement | null>(null);
  const draggingVert = useRef(false);
  const draggingHorz = useRef(false);
  const vertClickOffset = useRef(0);

  /* ================= VERTICAL DRAG ================= */
  const onVertMouseDown = (e: React.MouseEvent) => {
    draggingVert.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

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
    if (!draggingHorz.current) {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
  };

  /* ================= HORIZONTAL DRAG ================= */
  const onHorzMouseDown = () => {
    if (isCompactBottomPanels) return;
    draggingHorz.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const onHorzMouseMove = (e: MouseEvent) => {
    if (!draggingHorz.current) return;
    const container = document.getElementById("bottom-panels");
    if (!container) return;

    const rect = container.getBoundingClientRect();
    let newQueueWidth = rect.right - e.clientX;
    newQueueWidth = Math.max(300, Math.min(600, newQueueWidth));
    setQueueWidth(newQueueWidth);
  };

  const stopHorzDrag = () => {
    draggingHorz.current = false;
    if (!draggingVert.current) {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
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

  /* ================= AVAILABLE WIDTH TRACKING ================= */
  useEffect(() => {
    const container = draftContainerRef.current;
    if (!container) return;

    const updateCompactMode = (width: number) => {
      setIsCompactBottomPanels(width < COMPACT_BOTTOM_BREAKPOINT);
    };

    updateCompactMode(container.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        updateCompactMode(entry.contentRect.width);
      }
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
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
      ref={draftContainerRef}
      className="h-screen flex flex-col overflow-hidden"
    >
      <DraftHeader />

      <main className="flex-1 flex flex-col min-h-0">
        {/* TOP PANEL - DRAFT RESULTS */}
        <section
          style={{ height: `${topHeight}%` }}
          className="min-h-[60px] overflow-auto border-b border-gray-300 bg-gray-100"
          aria-label="Draft results and picks"
          tabIndex={0}
        >
          <DraftResultsPanel onStockClick={handleStockClick} />
        </section>

        {/* VERTICAL RESIZER */}
        <div
          onMouseDown={onVertMouseDown}
          className="relative h-px cursor-row-resize group"
        >
          <div className="absolute inset-x-0 -top-1.5 h-3" />
        </div>

        {/* BOTTOM PANELS */}
        <section
          id="bottom-panels"
          className={`flex flex-1 min-h-0 bg-white ${
            isCompactBottomPanels ? "flex-col" : "relative"
          }`}
          aria-label="Stock search and queue"
        >
          {isCompactBottomPanels && !draftEnded && (
            <nav className="h-12 bg-white border-b border-gray-300 flex items-center px-6">
              <ul className="flex w-full">
                <li className="flex-1">
                  <button
                    type="button"
                    onClick={() => setActiveBottomTab("search")}
                    aria-current={
                      activeBottomTab === "search" ? "page" : undefined
                    }
                    className={`relative w-full py-3 transition-colors group cursor-pointer text-center ${
                      activeBottomTab === "search"
                        ? "font-medium text-green-700"
                        : ""
                    }`}
                  >
                    <span className="pointer-events-none">Search</span>
                    <span
                      className={`absolute -left-0.5 -right-0.5 h-[2.5px] ${
                        activeBottomTab === "search"
                          ? "bg-green-700"
                          : "bg-transparent group-hover:bg-gray-300"
                      } bottom-0`}
                    />
                  </button>
                </li>
                <li className="flex-1">
                  <button
                    type="button"
                    onClick={() => setActiveBottomTab("queue")}
                    aria-current={
                      activeBottomTab === "queue" ? "page" : undefined
                    }
                    className={`relative w-full py-3 transition-colors group cursor-pointer text-center ${
                      activeBottomTab === "queue"
                        ? "font-medium text-green-700"
                        : ""
                    }`}
                  >
                    <span className="pointer-events-none">Queue</span>
                    <span
                      className={`absolute -left-0.5 -right-0.5 h-[2.5px] ${
                        activeBottomTab === "queue"
                          ? "bg-green-700"
                          : "bg-transparent group-hover:bg-gray-300"
                      } bottom-0`}
                    />
                  </button>
                </li>
              </ul>
            </nav>
          )}

          <div
            className={`flex-1 min-h-0 ${
              isCompactBottomPanels
                ? "relative overflow-hidden"
                : "flex min-w-0 overflow-hidden"
            }`}
          >
            {/* LEFT PANEL */}
            <div
              className={
                isCompactBottomPanels
                  ? `absolute inset-0 overflow-hidden ${
                      activeBottomTab === "search" ? "block" : "hidden"
                    }`
                  : "flex-1 w-0 min-w-0 border-r border-gray-300 overflow-hidden"
              }
            >
              <DraftSearchPanel onStockClick={handleStockClick} />
            </div>

            {/* HORIZONTAL RESIZER */}
            {!isCompactBottomPanels && !draftEnded && (
              <div
                onMouseDown={onHorzMouseDown}
                className="relative w-px cursor-col-resize group"
              >
                <div className="absolute inset-y-0 -left-1.5 w-3" />
              </div>
            )}

            {/* RIGHT PANEL */}
            {!draftEnded && (
              <div
                style={
                  !isCompactBottomPanels
                    ? { width: `${queueWidth}px` }
                    : undefined
                }
                className={
                  isCompactBottomPanels
                    ? `absolute inset-0 overflow-auto ${
                        activeBottomTab === "queue" ? "block" : "hidden"
                      }`
                    : "shrink-0 min-w-[300px] max-w-[350px] overflow-auto"
                }
                tabIndex={0}
              >
                <DraftQueuePanel onStockClick={handleStockClick} />
              </div>
            )}
          </div>
        </section>
      </main>

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
