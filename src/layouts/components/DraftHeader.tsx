import { useDraft } from "../../context/DraftContext";
import DraftTimer from "./DraftTimer";
import { Button } from "../../components/ui/button";

const DraftHeader = () => {
  const { currentUser, round, draftStarted, draftEnded, startDraft } = useDraft();

  return (
    <header style={{ padding: "1rem", borderBottom: "1px solid #eee", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <h1>Draft Room</h1>
      <div style={{ display: "flex", alignItems: "center" }}>
        {draftStarted && !draftEnded && (
          <div>
            <span>Round: {round} | Current: {currentUser?.user_id}</span>
            <DraftTimer />
          </div>
        )}
        
        
        {!draftStarted && (
          <Button style={{ marginLeft: "1rem" }} onClick={startDraft} size="sm">
            Start Draft
          </Button>
        )}
      </div>
    </header>
  );
};

export default DraftHeader;