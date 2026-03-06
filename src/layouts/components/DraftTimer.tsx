import { useDraft } from "../../context/DraftContext";

const DraftTimer = () => {
  const { timer, activePortfolio, myPortfolio } = useDraft();
  const isMyTurn = activePortfolio?.portfolio_id === myPortfolio?.portfolio_id;

  return (
    <span className="font-medium text-md">
      Time left:{" "}
      <span
        className={`font-semibold ${
          isMyTurn ? "text-yellow-600 text-lg" : "text-black"
        }`}
      >
        {timer}s
      </span>
    </span>
  );
};

export default DraftTimer;
