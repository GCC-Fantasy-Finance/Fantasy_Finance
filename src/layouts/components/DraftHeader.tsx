import { useDraft } from "../../context/DraftContext";
import DraftTimer from "./DraftTimer";
import { Button } from "../../components/ui/button";
import { useNavigate } from "react-router-dom";

const DraftHeader = () => {
  const {
    name,
    activePortfolio,
    round,
    draftStarted,
    draftEnded,
    startDraft,
    isOwner,
    leagueId,
  } = useDraft();

  const navigate = useNavigate();

  return (
    <>
      <header
        style={{
          padding: "1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/league/${leagueId}`)}
          className="border-black text-black bg-white hover:bg-gray-100"
        >
          ← Back
        </Button>
        
        <h1>{name}</h1>

        <div style={{ display: "flex", alignItems: "center" }}>
          {draftStarted && !draftEnded && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
              }}
            >
              <span>
                Round: {round} | Current Pick:{" "}
                {activePortfolio?.Profiles?.username ?? "Name not found"}
              </span>
              <DraftTimer />
            </div>
          )}

          {!draftStarted && !draftEnded && isOwner && (
            <Button
              style={{ marginLeft: "1rem" }}
              onClick={startDraft}
              size="sm"
            >
              Start Draft
            </Button>
          )}
        </div>
      </header>

      <hr className="border-black" />
    </>
  );
};

export default DraftHeader;