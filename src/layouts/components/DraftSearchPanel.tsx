import { useDraft } from "../../context/DraftContext";
import { Button } from "../../components/ui/button";
import { useAuth } from "../../context/AuthContext";

const DraftSearchPanel = () => {
  const { advancePick, currentUser, draftStarted, draftEnded } = useDraft();
  const { user } = useAuth();

  const isMyPick =
    !!user &&
    !!currentUser &&
    currentUser.user_id === user.id;

  const disabled =
    !draftStarted ||
    draftEnded ||
    !isMyPick;

  return (
    <div>
      <h2>Search</h2>

      <Button
        onClick={advancePick}
        size="sm"
        disabled={disabled}
        style={{ marginTop: "1rem" }}
      >
        {isMyPick
          ? `Draft for ${currentUser?.Profiles?.username ?? "Name not found"}`
          : "Queue"}
      </Button>
    </div>
  );
};

export default DraftSearchPanel;