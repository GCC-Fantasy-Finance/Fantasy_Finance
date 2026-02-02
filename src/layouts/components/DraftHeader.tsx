import { useDraft } from "../../context/DraftContext";
import DraftTimer from "./DraftTimer";
import { Button } from "../../components/ui/button";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { getLeagueById, type LeagueRow } from "../../lib/leagues";

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
  } = useDraft();

  const navigate = useNavigate();

  // Local state for league info
  const [league, setLeague] = useState<LeagueRow | null>(null);

  // Countdown state for "Draft starts in"
  const [countdown, setCountdown] = useState(0);

  // Fetch league info
  useEffect(() => {
    const fetchLeague = async () => {
      const data = await getLeagueById(leagueId);
      setLeague(data);
    };
    fetchLeague();
  }, [leagueId]);

  // Countdown logic
  useEffect(() => {
    if (!league?.start_time) return;

    const startTime = new Date(league.start_time).getTime();

    const updateCountdown = () => {
      const now = Date.now();
      const diff = Math.max(Math.floor((startTime - now) / 1000), 0);
      setCountdown(diff);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [league?.start_time]);

  // Compute dynamically instead of storing in state
  const showCountdownButton =
    !draftStarted && !draftEnded && countdown > 0 && !isOwner;

  // Format seconds into hh:mm:ss or mm:ss
  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

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

          {!draftStarted && !draftEnded && isOwner && (
            <Button onClick={startDraft} size="sm">
              Start Draft
            </Button>
          )}

          {showCountdownButton && (
            <Button
              variant="outline"
              size="sm"
              className="border-black text-black bg-white hover:bg-white"
              disabled
            >
              Draft Starts in {formatTime(countdown)}
            </Button>
          )}
        </div>
      </header>

      <hr className="border-black" />
    </>
  );
};

export default DraftHeader;