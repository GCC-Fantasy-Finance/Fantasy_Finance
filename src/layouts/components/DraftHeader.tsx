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
    timer
  } = useDraft();

  const navigate = useNavigate();

  return (
    <>
      <header
        style={{
          padding: "1rem",
          display: "flex",
          alignItems: "center",
        }}
      >
        {/* Left side: Back button + League name */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/league/${leagueId}`)}
            className="border-black text-black bg-white hover:bg-gray-100"
          >
            ← Back
          </Button>

          <h1 style={{ margin: 0 }}>{name}</h1>
        </div>

        {/* Spacer pushes everything after this to the far right */}
        <div style={{ flex: 1 }} />

        {/* Right side: Draft info + Start button */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
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

          {!draftStarted && !draftEnded && isOwner ? (
            <Button onClick={startDraft} size="sm">
              Start Draft
            </Button>
          ) : !draftStarted && !isOwner ? (
            <Button variant="outline" size="sm" className="border-black text-black bg-white hover:bg-white">
              Draft Starts in {timer}
            </Button>
          ) : (<></>)}
        </div>
      </header>


      <hr className="border-black" />
    </>
  );
};

export default DraftHeader;