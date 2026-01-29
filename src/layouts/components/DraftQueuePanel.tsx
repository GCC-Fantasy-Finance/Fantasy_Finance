import { useDraft } from "../../context/DraftContext";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/ui/button";

const DraftQueuePanel = () => {
  const {
    queuedItems,
    makePick,
    removeFromQueue,
    activePortfolio,
    draftStarted,
    draftEnded,
    myPortfolio,
  } = useDraft();

  const { user } = useAuth();

  const isMyPick =
    !!user &&
    !!activePortfolio &&
    activePortfolio.user_id === user.id;

  const canDraft =
    activePortfolio &&
    myPortfolio &&
    draftStarted &&
    !draftEnded &&
    isMyPick;

  return (
    <div style={{ padding: "0.5rem" }}>
      <h2>Draft Queue</h2>

      {queuedItems.length === 0 && <div>No queued stocks</div>}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {queuedItems.map((item) => (
          <li
            key={item.stock_id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.5rem",
              borderBottom: "1px solid #eee",
              paddingBottom: "0.25rem",
            }}
          >
            <span>Stock ID: {item.stock_id}</span>

            {canDraft ? (
              <Button
                size="sm"
                onClick={() => makePick(item.stock_id)}
              >
                Draft
              </Button>
            ) : (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => removeFromQueue(item.stock_id)}
              >
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default DraftQueuePanel;