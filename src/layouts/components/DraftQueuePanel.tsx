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
    queuedLoaded,
    makePick,
    removeFromQueue,
    reorderQueue,
    activePortfolio,
    draftStarted,
    draftEnded,
    myPortfolio,
    isMakingPick,
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

    if (queuedLoaded) loadStocks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedItems, queuedLoaded]);

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
    <div className="p-2 text-xs">
      <h2 className="mb-2 font-semibold">Draft Queue</h2>

      {!queuedLoaded ? (
        <div>Loading...</div>
      ) : queuedItems.length === 0 ? (
        <div>No queued stocks</div>
      ) : null}

      <ul className="list-none p-0">
        {queuedItems.map((item, index) => {
          const stock = stockMap[item.stock_id];
          const isTopItem = index === 0;

          return (
            <li
              key={item.stock_id}
              onClick={() => {
                if (!isMakingPick && stock) {
                  onStockClick(stock.stock_id);
                }
              }}
              onDragEnter={() => handleDragEnter(index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => e.preventDefault()}
              className={`
                relative flex items-center justify-between
                mb-2 border-b px-2 py-1 rounded
                cursor-pointer
                hover:bg-gray-100
                ${index === hoverIndex ? "bg-gray-100" : ""}
                ${isTopItem ? "outline outline-2 outline-dashed outline-orange-200 -outline-offset-2" : ""}
              `}
            >
              {isTopItem && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-white px-1 text-[10px] font-bold text-orange-300">
                  Next up
                </div>
              )}

              <div className="flex items-center gap-2">
                <span
                  draggable
                  onClick={(e) => e.stopPropagation()}
                  onDragStart={(e) => {
                    e.stopPropagation();
                    handleDragStart(index);
                  }}
                  className="cursor-grab active:cursor-grabbing p-1 grid grid-cols-2 gap-[2px] select-none"
                  title="Drag to reorder"
                >
                  {Array.from({ length: 6 }).map((_, i) => (
                    <span
                      key={i}
                      className="w-[3px] h-[3px] rounded-full bg-gray-600"
                    />
                  ))}
                </span>

                {/* LOGO */}
                <div className="w-7 h-7 flex items-center justify-center shrink-0">
                  {stock?.logo_url ? (
                    <img
                      src={stock.logo_url}
                      alt={stock.stock_symbol}
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs">
                      {stock?.stock_symbol?.[0]}
                    </div>
                  )}
                </div>

                {/* SYMBOL */}
                <span className="font-semibold leading-none" title={stock?.name}>
                  {stock ? stock.stock_symbol : "Loading..."}
                </span>
              </div>

              {canDraft ? (
                <Button
                  size="sm"
                  disabled={isMakingPick}
                  onClick={(e) => {
                    e.stopPropagation();
                    makePick(stock.stock_id);
                  }}
                >
                  Draft
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-700 text-red-700 bg-white hover:bg-gray-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFromQueue(item.stock_id);
                  }}
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