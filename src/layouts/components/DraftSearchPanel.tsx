import { useDraft } from "../../context/DraftContext";
import { Button } from "../../components/ui/button";

const DraftSearchPanel = () => {
  const { advancePick, currentUser, draftStarted, draftEnded } = useDraft();

  return (
    <div>
      <h2>Search</h2>
      <Button
        onClick={advancePick}
        size="sm"
        disabled={!draftStarted || draftEnded}
        style={{ marginTop: "1rem" }}
      >
        Draft for {currentUser?.user_id}
      </Button>
    </div>
  );
};

export default DraftSearchPanel;