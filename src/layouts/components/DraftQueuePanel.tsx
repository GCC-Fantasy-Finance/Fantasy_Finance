import { useState, useEffect } from "react";
import { useDraft } from "../../context/DraftContext";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/ui/button";
import { getStockById, type StockRow } from "@/lib/stocks";

interface DraftQueuePanelProps {
  onStockClick: (stockId: number) => void;
}

const DraftQueuePanel = ({ onStockClick }: DraftQueuePanelProps) => {
  const {
    queuedItems,
    makePick,
    removeFromQueue,
    reorderQueue,
    activePortfolio,
    draftStarted,
    draftEnded,
    myPortfolio,
  } = useDraft();

  const { user } = useAuth();

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [stockMap, setStockMap] = useState<Record<number, StockRow>>({});

  const isMyPick =
    !!user && !!activePortfolio && activePortfolio.user_id === user.id;

  const canDraft =
    activePortfolio &&
    myPortfolio &&
    draftStarted &&
    !draftEnded &&
    isMyPick;

  useEffect(() => {
    const loadStocks = async () => {
      const missingIds = queuedItems
        .map((q) => q.stock_id)
        .filter((id) => !stockMap[id]);

      if (missingIds.length === 0) return;

      const updates: Record<number, StockRow> = {};
      for (const id of missingIds) {
        const stock = await getStockById(id);
        if (stock) updates[id] = stock;
      }

      setStockMap((prev) => ({ ...prev, ...updates }));
    };

    loadStocks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedItems]);

  const handleDragStart = (index: number) => setDragIndex(index);
  const handleDragEnter = (index: number) => setHoverIndex(index);

  const handleDragEnd = () => {
    if (dragIndex !== null && hoverIndex !== null && dragIndex !== hoverIndex) {
      reorderQueue(dragIndex, hoverIndex);
    }
    setDragIndex(null);
    setHoverIndex(null);
  };

  return (
    <div style={{ padding: "0.5rem" }}>
      <h2>Draft Queue</h2>

      {queuedItems.length === 0 && <div>No queued stocks</div>}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {queuedItems.map((item, index) => {
          const stock = stockMap[item.stock_id];
          const isTopItem = index === 0;

          return (
            <li
              key={item.stock_id}
              onDragEnter={() => handleDragEnter(index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => e.preventDefault()}
              style={{
                position: "relative", // needed for floating label
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "0.75rem",
                borderBottom: "1px solid #eee",
                padding: "0.6rem 0.5rem 0.5rem 0.5rem",
                borderRadius: "6px",
                border: isTopItem ? "2px dashed #FFD1B3" : undefined,
                background:
                  index === hoverIndex ? "rgba(0,0,0,0.05)" : "transparent",
              }}
            >
              {isTopItem && (
                <div
                  style={{
                    position: "absolute",
                    top: "-10px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "white",
                    padding: "0 6px",
                    fontSize: "0.9rem",
                    fontWeight: 700,
                    color: "#FFD1B3",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  ⚡ Next up
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onMouseDown={(e) => (e.currentTarget.style.cursor = "grabbing")}
                  onMouseUp={(e) => (e.currentTarget.style.cursor = "grab")}
                  onMouseLeave={(e) => (e.currentTarget.style.cursor = "grab")}
                  title="Drag to reorder"
                  style={{
                    cursor: "grab",
                    padding: "4px",
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 4px)",
                    gap: "3px",
                    userSelect: "none",
                  }}
                >
                  {Array.from({ length: 6 }).map((_, i) => (
                    <span
                      key={i}
                      style={{
                        width: "4px",
                        height: "4px",
                        borderRadius: "50%",
                        backgroundColor: "#666",
                      }}
                    />
                  ))}
                </span>

                <span
                  style={{
                    fontWeight: 600,
                    cursor: stock ? "pointer" : "default",
                  }}
                  onClick={() => stock && onStockClick(stock.stock_id)}
                  title={stock?.name}
                >
                  {stock ? stock.stock_symbol : "Loading..."}
                </span>
              </div>

              {canDraft ? (
                <Button size="sm" onClick={() => makePick(item.stock_id)}>
                  Draft
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-700 text-red-700 bg-white hover:bg-gray-100"
                  onClick={() => removeFromQueue(item.stock_id)}
                >
                  Dequeue
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default DraftQueuePanel;