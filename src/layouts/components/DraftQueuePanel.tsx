import { useDraft } from "../../context/DraftContext";

const DraftQueuePanel = () => {
  const { queuedItems } = useDraft();

  return (
    <div style={{ padding: "0.5rem" }}>
      <h2>Draft Queue</h2>

      {queuedItems.length === 0 && (
        <div>No queued stocks</div>
      )}

      <ul>
        {queuedItems.map((item, idx) => (
          <li key={`${item.stock_id}-${idx}`}>
            Stock ID: {item.stock_id}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default DraftQueuePanel;