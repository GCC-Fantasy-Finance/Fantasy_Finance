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

  // stock_id -> StockRow
  const [stockMap, setStockMap] = useState<Record<number, StockRow>>({});

  const isMyPick =
    !!user && !!activePortfolio && activePortfolio.user_id === user.id;

  const canDraft =
    activePortfolio &&
    myPortfolio &&
    draftStarted &&
    !draftEnded &&
    isMyPick;

  // Fetch stock info for queued items
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
  }, [queuedItems]); // eslint-disable-line

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragEnter = (index: number) => {
    setHoverIndex(index);
  };

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

          return (
            <li
              key={item.stock_id}
              onDragEnter={() => handleDragEnter(index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => e.preventDefault()}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "0.5rem",
                borderBottom: "1px solid #eee",
                paddingBottom: "0.25rem",
                background:
                  index === hoverIndex ? "rgba(0,0,0,0.05)" : "transparent",
              }}
            >
              {/* Drag handle + stock info */}
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <span
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  style={{
                    cursor: "grab",
                    padding: "0 4px",
                    fontSize: "1.2rem",
                    userSelect: "none",
                  }}
                  title="Drag to reorder"
                >
                  ☰
                </span>

                {/* Stock symbol clickable */}
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

              {/* Buttons */}
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
                  Remove
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