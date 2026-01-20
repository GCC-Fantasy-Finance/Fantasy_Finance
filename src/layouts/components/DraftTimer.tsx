import { useDraft } from "../../context/DraftContext";

const DraftTimer = () => {
  const { timer } = useDraft();
  return (
    <span style={{ marginLeft: "1rem", fontWeight: "bold" }}>
      Time left: {timer}s
    </span>
  );
};

export default DraftTimer;