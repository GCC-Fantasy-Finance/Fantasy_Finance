import type { HoldingView } from "@/hooks/fetchPortfolio";
import { Button } from "@/components/ui/button";
import Ticker from "@/components/ui/ticker";
import { cn, truncateCurrency } from "@/lib/utils";

type PortfolioHoldingCardProps = {
  holding: HoldingView;
  onOpenStockDetails: (stockId?: number) => void;
  onSell: (holding: HoldingView) => void;
  onBuy: (holding: HoldingView) => void;
  onUnsave?: (holding: HoldingView) => void;
  buyButtonLabel?: "Buy" | "Buy More";
  muted?: boolean;
  showBottomBorder?: boolean;
  showTopRounded?: boolean;
  showBottomRounded?: boolean;
  showSellButton?: boolean;
  showUnsaveButton?: boolean;
  showHoldingValue?: boolean;
};

export default function PortfolioHoldingCard({
  holding,
  onOpenStockDetails,
  onSell,
  onBuy,
  onUnsave,
  buyButtonLabel,
  muted = false,
  showBottomBorder = false,
  showTopRounded = false,
  showBottomRounded = false,
  showSellButton = true,
  showUnsaveButton = false,
  showHoldingValue = true,
}: PortfolioHoldingCardProps) {
  const price = Number(holding.stock?.current_price ?? 0);
  const qty = Number(holding.quantity ?? 0);
  const total = price * qty;
  const buyLabel = buyButtonLabel ?? (qty > 0 ? "Buy More" : "Buy");

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "grid w-full cursor-pointer items-center justify-items-start gap-4 border-x border-t border-gray-300 bg-white px-4 py-4 transition-all hover:bg-gray-50 max-[540px]:grid-cols-2 rounded-none",
        showHoldingValue
          ? "grid-cols-[20%_minmax(0,200px)_minmax(0,200px)_auto]"
          : "grid-cols-[20%_minmax(0,200px)_auto]",
        showBottomBorder ? "border-b" : "border-b-0",
        showTopRounded && "rounded-t-lg",
        showBottomRounded && "rounded-b-lg",
        muted && "text-gray-500",
      )}
      onClick={() => onOpenStockDetails(holding.stock?.stock_id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onOpenStockDetails(holding.stock?.stock_id);
        }
      }}
    >
      {/* Symbol */}
      <div className="relative z-10 text-left flex min-w-0 flex-col font-medium max-[540px]:col-span-2">
        {holding.stock?.stock_symbol}
        <span className="text-sm font-normal text-gray-500">
          {holding.stock?.name}
        </span>
      </div>

      {/* Current Price and Percent Change */}
      <div className="relative z-10 flex min-w-0 flex-col text-left">
        <span className="text-xs text-gray-500">CURRENT:</span>
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span>${truncateCurrency(price)}</span>
          <Ticker
            currentValue={holding.stock?.current_price}
            previousValue={holding.stock?.previous_close}
            displayAs="percent"
            size="small"
            className={cn("min-w-0", muted && "text-gray-500!")}
          />
        </div>
      </div>

      {showHoldingValue && (
        <div className="relative z-10 min-w-0 text-left flex flex-col">
          <span className="text-xs text-gray-500">YOU OWN:</span>
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-medium">${truncateCurrency(total)}</span>
            <span className="text-xs text-gray-500">
              {qty.toFixed(3)} shares
            </span>
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="relative z-10 ml-auto flex items-center gap-2 justify-self-end max-[540px]:col-span-2 max-[540px]:ml-0 max-[540px]:w-full max-[540px]:justify-self-stretch">
        {showUnsaveButton && (
          <Button
            variant="outline"
            size="xs"
            className="border-gray-600 text-gray-700 hover:bg-gray-100 max-[540px]:flex-1"
            onClick={(event) => {
              event.stopPropagation();
              onUnsave?.(holding);
            }}
          >
            Unsave
          </Button>
        )}

        {showSellButton && (
          <Button
            variant="outline"
            size="xs"
            className="border-red-600 text-red-700 hover:bg-red-50 max-[540px]:flex-1"
            onClick={(event) => {
              event.stopPropagation();
              onSell(holding);
            }}
          >
            Sell
          </Button>
        )}

        <Button
          variant="outline"
          size="xs"
          className="w-20 justify-center border-green-600 text-green-700 hover:bg-green-50 max-[540px]:flex-1"
          onClick={(event) => {
            event.stopPropagation();
            onBuy(holding);
          }}
        >
          {buyLabel}
        </Button>
      </div>
    </div>
  );
}
