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
        "ff-portfolio-holding-card grid w-full cursor-pointer items-center justify-items-start gap-4 border-x border-t border-gray-300 bg-white px-4 py-4 transition-all hover:bg-gray-50 rounded-none",
        showHoldingValue
          ? "ff-portfolio-holding-card--with-holding grid-cols-[20%_minmax(0,200px)_minmax(0,200px)_auto]"
          : "ff-portfolio-holding-card--without-holding grid-cols-[20%_minmax(0,200px)_auto]",
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
      <div className="ff-portfolio-holding-card__symbol relative z-10 text-left flex min-w-0 items-center gap-2 font-medium">
        {holding.stock?.logo_url ? (
          <img
            src={holding.stock.logo_url}
            alt={holding.stock.stock_symbol ?? ""}
            className="h-lh w-lh shrink-0 object-contain"
          />
        ) : (
          <div className="h-lh w-lh shrink-0 bg-gray-200 flex items-center justify-center text-gray-500 text-xs rounded-sm">
            {holding.stock?.stock_symbol?.[0]}
          </div>
        )}
        <div className="flex min-w-0 flex-col">
          {holding.stock?.stock_symbol}
          <span className="text-sm font-normal text-gray-500 truncate">
            {holding.stock?.name}
          </span>
        </div>
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
      <div className="ff-portfolio-holding-card__actions relative z-10 ml-auto flex items-center gap-2 justify-self-end">
        {showUnsaveButton && (
          <Button
            variant="outline"
            size="xs"
            className="ff-portfolio-holding-card__action border-gray-600 text-gray-700 hover:bg-gray-100"
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
            className="ff-portfolio-holding-card__action border-red-600 text-red-700 hover:bg-red-50"
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
          className="ff-portfolio-holding-card__action w-20 justify-center border-green-600 text-green-700 hover:bg-green-50"
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
