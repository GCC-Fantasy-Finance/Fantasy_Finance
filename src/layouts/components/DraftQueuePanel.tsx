import { useState, useEffect } from "react";
import { useDraft } from "../../context/DraftContext";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/ui/button";
import { getStockById, type StockRow } from "@/lib/stocks";
import LightningBoltIcon from "@/components/ui/lightning-bolt-icon";
import { Trash2 } from "lucide-react";

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
    activePortfolio && myPortfolio && draftStarted && !draftEnded && isMyPick;

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
    <section className="flex h-full flex-col" aria-label="Draft queue">
      <header className="h-12 flex items-center justify-center border-b border-gray-300">
        <h2 className="text-lg text-center">Draft Queue</h2>
      </header>

      {!queuedLoaded ? (
        <div>Loading...</div>
      ) : queuedItems.length === 0 ? (
        <div className="flex min-h-40 items-center justify-center text-center text-gray-600">
          No queued stocks
        </div>
      ) : null}

      <ul className="list-none flex-1 overflow-y-auto p-2 pt-8">
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
                border-b px-2 py-3
                cursor-pointer
                hover:bg-green-100/60
                ${index === hoverIndex ? "bg-gray-100" : ""}
                ${isTopItem ? "bg-green-100/90 rounded-md py-2 outline-2 outline-dashed outline-green-700/40 -outline-offset-2" : ""}
              `}
            >
              {isTopItem && (
                <div className="flex items-center gap-1 absolute -top-5.5 left-1/2 -translate-x-1/2 bg-white px-1 text-sm font-medium text-green-600">
                  <LightningBoltIcon className="w-3.5 h-3.5" />
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
                  className="cursor-grab active:cursor-grabbing p-1 grid grid-cols-2 gap-0.5 select-none"
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
                <span className="font-medium leading-none" title={stock?.name}>
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
                  size="icon"
                  variant="ghost"
                  className=" text-gray-700 hover:text-red-700 hover:bg-red-500/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFromQueue(item.stock_id);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </li>
          );
        })}
        <li aria-hidden="true" className="h-[120px]" />
      </ul>
    </section>
  );
};

export default DraftQueuePanel;
