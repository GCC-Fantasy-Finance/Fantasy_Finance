import { useDraft } from "../../context/DraftContext";

const DraftTimer = () => {
  const { timer } = useDraft();
  return <span className="font-semibold">Time left: {timer}s</span>;
};

export default DraftTimer;
