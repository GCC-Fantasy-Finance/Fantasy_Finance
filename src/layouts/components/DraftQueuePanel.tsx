import { useState, useEffect, useRef } from "react";
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
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [touchCurrentY, setTouchCurrentY] = useState<number | null>(null);
  const [listRef, setListRef] = useState<HTMLUListElement | null>(null);
  const [initialScrollTop, setInitialScrollTop] = useState<number | null>(null);
  const [mouseStartY, setMouseStartY] = useState<number | null>(null);
  const [mouseCurrentY, setMouseCurrentY] = useState<number | null>(null);

  const globalMouseListenerRef = useRef<((evt: MouseEvent) => void) | null>(null);

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

  useEffect(() => {
    return () => {
      // Cleanup: Remove global mouse listener on unmount
      if (globalMouseListenerRef.current) {
        document.removeEventListener("mousemove", globalMouseListenerRef.current);
      }
    };
  }, []);

  const handleDragStart = (index: number, e?: React.DragEvent) => {
    setDragIndex(index);
    if (e && listRef) {
      setMouseStartY(e.clientY);
      setMouseCurrentY(e.clientY);
      setInitialScrollTop(listRef.scrollTop);
      
      // Add global mouse move listener to track position even outside window
      const handleGlobalMouseMove = (evt: MouseEvent) => {
        setMouseCurrentY(evt.clientY);
        
        // Auto-scroll when dragging near edges (but not too aggressive)
        const scrollThreshold = 40;
        const listRect = listRef.getBoundingClientRect();
        const clientY = evt.clientY;
        
        if (clientY > listRect.bottom - scrollThreshold && listRef.scrollTop + listRef.clientHeight < listRef.scrollHeight) {
          listRef.scrollBy(0, 4);
        } else if (clientY < listRect.top + scrollThreshold && listRef.scrollTop > 0) {
          listRef.scrollBy(0, -4);
        }
        
        // Also update hover index even when onDragOver doesn't fire - account for visual transforms
        const items = listRef.querySelectorAll("li[data-index]");
        let newHoverIndex: number | null = null;
        
        for (let i = 0; i < items.length; i++) {
          const element = items[i] as HTMLElement;
          const itemIndex = parseInt(element.getAttribute("data-index") || "", 10);
          
          // Skip the item being dragged
          if (itemIndex === dragIndex) continue;
          
          const rect = element.getBoundingClientRect();
          
          // When dragging down, only insert before item if cursor is in top 1/3
          // When dragging up, insert before item if cursor is above center
          const isDraggingDown = mouseCurrentY !== null && mouseStartY !== null && mouseCurrentY > mouseStartY;
          const threshold = isDraggingDown ? rect.top + (rect.height / 3) : (rect.top + rect.bottom) / 2;
          
          if (clientY < threshold) {
            newHoverIndex = itemIndex;
            break;
          }
        }
        
        // If below all items, insert after the last item
        if (newHoverIndex === null && items.length > 0) {
          newHoverIndex = items.length;
        }
        
        // Clamp hover index to reasonable range to prevent wild jumps
        if (newHoverIndex !== null && dragIndex !== null) {
          const min = 0;
          const max = items.length;
          newHoverIndex = Math.max(min, Math.min(max, newHoverIndex));
        }
        
        if (newHoverIndex !== null) {
          setHoverIndex(newHoverIndex);
        }
      };
      
      globalMouseListenerRef.current = handleGlobalMouseMove;
      document.addEventListener("mousemove", handleGlobalMouseMove);
    }
  };

  const handleTouchStart = (index: number, e: React.TouchEvent) => {
    e.stopPropagation();
    setDragIndex(index);
    setTouchStartY(e.touches[0].clientY);
    setTouchCurrentY(e.touches[0].clientY);
    setInitialScrollTop(listRef?.scrollTop ?? 0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (dragIndex === null || !listRef) return;
    e.preventDefault();
    
    const currentY = e.touches[0].clientY;
    setTouchCurrentY(currentY);
    
    // Auto-scroll when dragging near edges (but not too aggressive)
    const scrollThreshold = 40;
    const listRect = listRef.getBoundingClientRect();
    
    if (currentY > listRect.bottom - scrollThreshold && listRef.scrollTop + listRef.clientHeight < listRef.scrollHeight) {
      listRef.scrollBy(0, 4);
    } else if (currentY < listRect.top + scrollThreshold && listRef.scrollTop > 0) {
      listRef.scrollBy(0, -4);
    }
    
    // Find insertion point - account for both DOM position and visual transforms
    const items = listRef.querySelectorAll("li[data-index]");
    let newHoverIndex: number | null = null;
    
    for (let i = 0; i < items.length; i++) {
      const element = items[i] as HTMLElement;
      const index = parseInt(element.getAttribute("data-index") || "", 10);
      
      // Skip the item being dragged
      if (index === dragIndex) continue;
      
      const rect = element.getBoundingClientRect();
      
      // When dragging down, only insert before item if cursor is in top 1/3
      // When dragging up, insert before item if cursor is above center
      const isDraggingDown = touchCurrentY !== null && touchStartY !== null && touchCurrentY > touchStartY;
      const threshold = isDraggingDown ? rect.top + (rect.height / 3) : (rect.top + rect.bottom) / 2;
      
      if (currentY < threshold) {
        newHoverIndex = index;
        break;
      }
    }
    
    // If below all items, insert after the last item
    if (newHoverIndex === null && items.length > 0) {
      newHoverIndex = items.length;
    }
    
    if (newHoverIndex !== null) {
      setHoverIndex(newHoverIndex);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragIndex === null || !listRef) return;
    
    const clientY = e.clientY;
    setMouseCurrentY(clientY);
    
    // Auto-scroll when dragging near edges (but not too aggressive)
    const scrollThreshold = 40;
    const listRect = listRef.getBoundingClientRect();
    
    if (clientY > listRect.bottom - scrollThreshold && listRef.scrollTop + listRef.clientHeight < listRef.scrollHeight) {
      listRef.scrollBy(0, 4);
    } else if (clientY < listRect.top + scrollThreshold && listRef.scrollTop > 0) {
      listRef.scrollBy(0, -4);
    }
    
    // Find insertion point - account for both DOM position and visual transforms
    const items = listRef.querySelectorAll("li[data-index]");
    let newHoverIndex: number | null = null;
    
    for (let i = 0; i < items.length; i++) {
      const element = items[i] as HTMLElement;
      const index = parseInt(element.getAttribute("data-index") || "", 10);
      
      // Skip the item being dragged
      if (index === dragIndex) continue;
      
      const rect = element.getBoundingClientRect();
      
      // When dragging down, only insert before item if cursor is in top 1/3
      // When dragging up, insert before item if cursor is above center
      const isDraggingDown = mouseCurrentY !== null && mouseStartY !== null && mouseCurrentY > mouseStartY;
      const threshold = isDraggingDown ? rect.top + (rect.height / 3) : (rect.top + rect.bottom) / 2;
      
      if (clientY < threshold) {
        newHoverIndex = index;
        break;
      }
    }
    
    // If below all items, insert after the last item
    if (newHoverIndex === null && items.length > 0) {
      newHoverIndex = items.length;
    }
    
    if (newHoverIndex !== null) {
      setHoverIndex(newHoverIndex);
    }
  };

  const handleTouchEnd = () => {
    if (dragIndex !== null) {
      let targetIndex = hoverIndex;
      
      // If no hover index was set during drag, determine position from final Y coordinate
      if (targetIndex === null && listRef && (touchCurrentY !== null)) {
        const items = listRef.querySelectorAll("li[data-index]");
        
        if (items.length > 0) {
          const firstRect = items[0].getBoundingClientRect();
          const lastRect = items[items.length - 1].getBoundingClientRect();
          
          if (touchCurrentY < firstRect.top) {
            targetIndex = 0;
          } else if (touchCurrentY > lastRect.bottom) {
            targetIndex = queuedItems.length;
          } else {
            // Find which item the pointer is closest to
            for (let i = 0; i < items.length; i++) {
              const rect = items[i].getBoundingClientRect();
              const itemCenter = (rect.top + rect.bottom) / 2;
              if (touchCurrentY < itemCenter) {
                targetIndex = parseInt(items[i].getAttribute("data-index") || "", 10);
                break;
              }
            }
            // If not found, default to end
            if (targetIndex === null) {
              targetIndex = queuedItems.length;
            }
          }
        }
      }
      
      if (targetIndex !== null && dragIndex !== targetIndex) {
        // Adjust target index when dragging down: since reorderQueue removes first,
        // indices shift, so we need to subtract 1 for drag-down operations
        const adjustedTarget = dragIndex < targetIndex ? targetIndex - 1 : targetIndex;
        reorderQueue(dragIndex, adjustedTarget);
      }
    }
    
    setDragIndex(null);
    setHoverIndex(null);
    setTouchStartY(null);
    setTouchCurrentY(null);
    setInitialScrollTop(null);
  };

  const handleMouseDragEnd = () => {
    // Remove global mouse move listener
    if (globalMouseListenerRef.current) {
      document.removeEventListener("mousemove", globalMouseListenerRef.current);
      globalMouseListenerRef.current = null;
    }
    
    if (dragIndex !== null) {
      let targetIndex = hoverIndex;
      
      // If no hover index was set during drag, determine position from final Y coordinate
      if (targetIndex === null && listRef && mouseCurrentY !== null) {
        const items = listRef.querySelectorAll("li[data-index]");
        
        if (items.length > 0) {
          const firstRect = items[0].getBoundingClientRect();
          const lastRect = items[items.length - 1].getBoundingClientRect();
          
          if (mouseCurrentY < firstRect.top) {
            targetIndex = 0;
          } else if (mouseCurrentY > lastRect.bottom) {
            targetIndex = queuedItems.length;
          } else {
            // Find which item the pointer is closest to
            for (let i = 0; i < items.length; i++) {
              const rect = items[i].getBoundingClientRect();
              const itemCenter = (rect.top + rect.bottom) / 2;
              if (mouseCurrentY < itemCenter) {
                targetIndex = parseInt(items[i].getAttribute("data-index") || "", 10);
                break;
              }
            }
            // If not found, default to end
            if (targetIndex === null) {
              targetIndex = queuedItems.length;
            }
          }
        }
      }
      
      if (targetIndex !== null && dragIndex !== targetIndex) {
        // Adjust target index when dragging down: since reorderQueue removes first,
        // indices shift, so we need to subtract 1 for drag-down operations
        const adjustedTarget = dragIndex < targetIndex ? targetIndex - 1 : targetIndex;
        reorderQueue(dragIndex, adjustedTarget);
      }
    }
    
    setDragIndex(null);
    setHoverIndex(null);
    setInitialScrollTop(null);
    setMouseStartY(null);
    setMouseCurrentY(null);
  };

  return (
    <section className="flex h-full flex-col" aria-label="Draft queue">
      <header className="h-12 flex items-center justify-center border-b border-gray-300">
        <h2 className="text-lg text-center">Draft Queue</h2>
      </header>

      {!queuedLoaded ? (
        <ul className="list-none flex-1 overflow-y-auto p-2 pt-8">
          {Array.from({ length: 5 }).map((_, index) => (
            <li
              key={`skeleton-${index}`}
              className={`
                relative flex items-center justify-between
                border-b px-2 py-3
                bg-gray-100
                rounded-md
                mb-2
              `}
            >
              {index === 0 && (
                <div className="flex items-center gap-1 absolute -top-5.5 left-1/2 -translate-x-1/2 bg-white px-1 text-sm font-medium text-gray-300">
                  <div className="w-3.5 h-3.5 bg-gray-200 rounded-full animate-pulse" />
                  <div className="w-16 h-4 bg-gray-200 rounded animate-pulse" />
                </div>
              )}

              <div className="flex items-center gap-2 flex-1">
                <span className="p-1 grid grid-cols-2 gap-0.5 select-none opacity-50">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <span
                      key={i}
                      className="w-[3px] h-[3px] rounded-full bg-gray-400"
                    />
                  ))}
                </span>

                {/* LOGO SKELETON */}
                <div className="w-7 h-7 flex items-center justify-center shrink-0">
                  <div className="w-full h-full bg-gray-300 rounded animate-pulse" />
                </div>

                {/* SYMBOL SKELETON */}
                <div className="flex-1 h-5 w-16 bg-gray-300 rounded animate-pulse" />
              </div>
            </li>
          ))}
          <li aria-hidden="true" className="h-[120px]" />
        </ul>
      ) : queuedItems.length === 0 ? (
        <div className="flex min-h-40 items-center justify-center text-center text-gray-600">
          No queued stocks
        </div>
      ) : null}

      <ul className="list-none flex-1 overflow-y-auto p-2 pt-8"
        ref={setListRef}
        onTouchMove={(e) => dragIndex === null && handleTouchMove(e)}
        onDragOver={(e) => {
          e.preventDefault();
          handleMouseMove(e as any);
        }}
      >
        {queuedItems.map((item, index) => {
          const stock = stockMap[item.stock_id];
          const isTopItem = index === 0;
          const isDragging = dragIndex === index;
          const scrollDelta = isDragging && listRef && initialScrollTop !== null 
            ? listRef.scrollTop - initialScrollTop 
            : 0;
          const yOffset = isDragging && ((touchStartY && touchCurrentY) || (mouseStartY && mouseCurrentY))
            ? ((touchCurrentY ?? mouseCurrentY ?? 0) - (touchStartY ?? mouseStartY ?? 0)) + scrollDelta
            : 0;
          
          // Calculate shift for other items to fill the gap
          let itemShift = 0;
          if (dragIndex !== null && dragIndex !== index && hoverIndex !== null) {
            const itemHeight = 60; // Approximate height (p-3 = 12px + border-b + gaps)
            
            if (dragIndex < hoverIndex) {
              // Dragging down: items between dragIndex and hoverIndex move up
              if (index > dragIndex && index < hoverIndex) {
                itemShift = -itemHeight;
              }
            } else {
              // Dragging up: items between hoverIndex and dragIndex move down
              if (index >= hoverIndex && index < dragIndex) {
                itemShift = itemHeight;
              }
            }
          }
          const combinedOffset = isDragging ? yOffset : itemShift;

          return (
            <li
              key={item.stock_id}
              data-index={index}
              onClick={() => {
                if (!isMakingPick && stock) {
                  onStockClick(stock.stock_id);
                }
              }}
              onTouchMove={(e) => handleTouchMove(e)}
              className={`
                relative flex items-center justify-between
                border-b px-2 py-3
                cursor-pointer
                ${isDragging ? "bg-green-200/80 shadow-lg rounded-md z-10" : "hover:bg-green-100/60"}
                ${index === hoverIndex && !isDragging ? "border-t-2 border-t-green-500" : ""}
                ${index === queuedItems.length - 1 && hoverIndex === queuedItems.length && !isDragging ? "border-b-2 border-b-green-500" : ""}
                ${isTopItem && !isDragging ? "bg-green-100/90 rounded-md py-2 outline-2 outline-dashed outline-green-700/40 -outline-offset-2" : ""}
              `}
              style={{
                transform: `translateY(${combinedOffset}px)`,
                transition: "none",
              }}
            >
              {isTopItem && (
                <div 
                  className="flex items-center gap-1 absolute -top-5.5 left-1/2 -translate-x-1/2 bg-white px-1 text-sm font-medium text-green-600"
                  style={{
                    transform: isDragging ? `translateY(${-yOffset}px)` : undefined,
                    transition: "none",
                  }}
                >
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
                    handleDragStart(index, e);
                  }}
                  onDragEnd={handleMouseDragEnd}
                  onTouchStart={(e) => handleTouchStart(index, e)}
                  onTouchEnd={handleTouchEnd}
                  className="cursor-grab active:cursor-grabbing p-1 grid grid-cols-2 gap-0.5 select-none"
                  style={{ touchAction: "none" }}
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
                      className="max-w-full max-h-full object-contain rounded-sm"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs rounded-sm">
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
