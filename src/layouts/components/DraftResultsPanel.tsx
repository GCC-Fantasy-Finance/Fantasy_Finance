import { useDraft } from "../../context/DraftContext";

const DraftResultsPanel = () => {
  const { 
    users, 
    currentPick, 
    round, 
    direction, 
    draftStarted, 
    draftEnded,
    draftRounds 
  } = useDraft();

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {users.map((user, userIdx) => (
        <div
          key={user.user_id}
          style={{
            flex: 1,
            padding: "0.5rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontWeight: "bold",
              marginBottom: "0.5rem",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              width: "100%",
              textAlign: "center",
            }}
          >
            {user?.Profiles?.username ?? "Name not found"}
          </div>

          {Array.from({ length: draftRounds }).map((_, idx) => {
            let isCurrent = false;
            let isPast = false;

            if (draftEnded) {
              isPast = true;
            } else if (draftStarted) {
              if (idx === round - 1) {
                if (userIdx === currentPick) {
                  isCurrent = true;
                } else if (
                  (direction === "forward" && userIdx < currentPick) ||
                  (direction === "backward" && userIdx > currentPick)
                ) {
                  isPast = true;
                }
              } else if (idx < round - 1) {
                isPast = true;
              }
            }

            let background = "#fff";
            let color = "#6b7280";
            let border = "1px solid #e5e7eb";
            let text = "";

            if (isPast) {
              background = "#f3f4f6";
              color = "#374151";
              border = "1px solid #d1d5db";
              text = "temp";
            }
            if (isCurrent) {
              background = "#2563eb";
              color = "#fff";
              border = "2px solid #2563eb";
              text = "";
            }

            return (
              <div
                key={idx}
                style={{
                  width: "90%",
                  minHeight: "32px",
                  margin: "0.2rem 0",
                  background,
                  border,
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: isPast || isCurrent ? "bold" : "normal",
                  color,
                  fontSize: "0.95rem",
                  transition: "background 0.2s, border 0.2s",
                }}
              >
                {text}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default DraftResultsPanel;