
import { useNavigate } from "react-router-dom";
import Ticker from "@/components/ui/ticker";

type PortfolioCard = {
  portfolio_id: number;
  is_solo: boolean;
  league_id?: number | null;
  net_value?: number | null;
  previous_close_value?: number | null;
  reserve_value?: number | null;
  name: string;
  rank?: number | null;
};

export default function HomePageCard(portfolio: PortfolioCard) {
    const navigate = useNavigate();
  const netValue = Number(
    portfolio.net_value ?? portfolio.previous_close_value ?? 0
  );
  const previousCloseValue = Number(portfolio.previous_close_value ?? 0);
  const baselineValue = previousCloseValue > 0 ? previousCloseValue : netValue;
  const reserveValue = Number(portfolio.reserve_value ?? 0);
  const amountInvested = netValue - reserveValue;
    

    return (
    <button
      className="group w-full text-left border-2 border-gray-300 rounded-lg p-4 cursor-pointer hover:bg-gray-100"

      onClick={() => {
        if (portfolio.is_solo) {
          navigate("/solo");
        } else {
          navigate(`/league/${portfolio.league_id}`);
        }
      }}
    >
      <div className="flex items-center justify-between w-full">
        <span className="text-xl text-green-600 font-semibold">{portfolio.name}</span>
        
          <span className="text-lg text-black">
            {portfolio.rank ? `Rank: ${portfolio.rank}` : "Unranked"}
          </span>
        
        
      </div>
      <div className="grid grid-cols-[43%_27%_27%] gap-3 w-full mt-3 justify-center">
        <div className="h-[80px] rounded-md bg-gray-100/80 group-hover:bg-gray-50 px-3 py-2 text-center flex flex-col justify-center transition-colors">
          <div className="text-md font-semibold text-black">Net</div>
          <div className="text-md font-medium flex items-center justify-center">
            <span>${netValue.toFixed(2)}</span>
            <Ticker
              currentValue={netValue}
              previousValue={baselineValue}
              displayAs="percent"
              size="normal"
            />
          </div>
        </div>
        <div className="h-[80px] rounded-md bg-gray-100/80 group-hover:bg-gray-50 px-3 py-2 text-center flex flex-col justify-center transition-colors">
          <div className="text-sm text-black">Reserve</div>
          <div className="text-md font-medium">${reserveValue.toFixed(2)}</div>
        </div>
        <div className="h-[80px] rounded-md bg-gray-100/80 group-hover:bg-gray-50 px-3 py-2 text-center flex flex-col justify-center transition-colors">
          <div className="text-sm text-black">Invested</div>
          <div className="text-md font-medium">${amountInvested.toFixed(2)}</div>
        </div>
      </div>
    </button>
    )

}