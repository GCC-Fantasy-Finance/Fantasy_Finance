import { useDraft } from "../../context/DraftContext";
import DraftTimer from "./DraftTimer";
import { Button } from "../../components/ui/button";

const DraftHeader = () => {
  const {
    activePortfolio,
    round,
    draftStarted,
    draftEnded,
    startDraft,
    isOwner,
  } = useDraft();

  return (
    <header
      style={{
        padding: "1rem",
        borderBottom: "1px solid #eee",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <h1>Draft Room</h1>

      <div style={{ display: "flex", alignItems: "center" }}>
        {/* Show round + current pick when draft is running */}
        {draftStarted && !draftEnded && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <span>
              Round: {round} | Current Pick: {activePortfolio?.Profiles?.username ?? "Name not found"}
            </span>
            <DraftTimer />
          </div>
        )}

        {/* Show Start Draft button only to the owner when draft has not started */}
        {!draftStarted && !draftEnded && isOwner && (
          <Button style={{ marginLeft: "1rem" }} onClick={startDraft} size="sm">
            Start Draft
          </Button>
        )}
      </div>
    </header>
  );
};

export default DraftHeader;