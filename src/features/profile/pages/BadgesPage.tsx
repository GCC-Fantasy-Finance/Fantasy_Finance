import { getAllBadgesWithEarned } from "@/lib/userBadges";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import type { BadgeWithEarned } from "@/lib/userBadges";

function Badges() {
  const { profile } = useAuth();
  const [badges, setBadges] = useState<BadgeWithEarned[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<BadgeWithEarned | null>(
    null,
  );

  useEffect(() => {
    if (profile?.id) {
      getAllBadgesWithEarned(profile.id).then((result) => {
        setBadges(result || []);
      });
    }
  }, [profile?.id]);

  const earnedBadges = badges.filter((b) => b.earned);
  const unearnedBadges = badges.filter((b) => !b.earned);

  return (
    <>
      {earnedBadges.length > 0 && (
        <div>
          <p className="text-gray-600 mb-3">Your Badges</p>
          <div className="w-full flex flex-wrap gap-2 mb-6">
            {earnedBadges.map((badge) => (
              <div
                key={badge.fixed_badge_id}
                className="w-fit flex flex-col items-center"
              >
                <button
                  type="button"
                  onClick={() => setSelectedBadge(badge)}
                  className="w-32 h-32 cursor-pointer transition-all rounded border border-transparent hover:border-green-300 hover:shadow-sm hover:scale-[1.02] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 flex items-center justify-center"
                  title={badge.description || "Click to view badge"}
                  aria-label={`View badge ${badge.name}`}
                >
                  {badge.image_path ? (
                    <img
                      src={badge.image_path}
                      alt={badge.name}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full rounded bg-gray-100 flex items-center justify-center text-xs text-gray-500">
                      Badge
                    </div>
                  )}
                </button>
                <p className="text-xs text-center mt-1 text-gray-600 max-w-32">
                  {badge.name}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {unearnedBadges.length > 0 && (
        <div>
          <p className="text-gray-600 mb-3">Other Badges</p>
          <div className="w-full flex flex-wrap gap-2">
            {unearnedBadges.map((badge) => (
              <div
                key={badge.fixed_badge_id}
                className="w-fit flex flex-col items-center"
              >
                <button
                  type="button"
                  onClick={() => setSelectedBadge(badge)}
                  className="w-32 h-32 cursor-pointer transition-all rounded border border-gray-300 opacity-40 hover:opacity-60 hover:border-gray-400 hover:shadow-sm active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 flex items-center justify-center"
                  title={`Locked: ${badge.name}`}
                  aria-label={`Locked badge ${badge.name}`}
                >
                  {badge.image_path ? (
                    <img
                      src={badge.image_path}
                      alt={badge.name}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full rounded bg-gray-100 flex items-center justify-center text-xs text-gray-500">
                      Badge
                    </div>
                  )}
                </button>
                <p className="text-xs text-center mt-1 text-gray-600 max-w-32">
                  {badge.name}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedBadge && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedBadge(null)}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-sm w-full shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-4">
              {selectedBadge.image_path ? (
                <img
                  src={selectedBadge.image_path}
                  alt={selectedBadge.name}
                  className="w-24 h-24 object-contain"
                />
              ) : (
                <div className="w-24 h-24 rounded bg-gray-100 flex items-center justify-center text-gray-500">
                  Badge
                </div>
              )}
            </div>
            <h2 className="text-lg font-semibold text-center mb-2">
              {selectedBadge.name}
            </h2>
            <p className="text-gray-600 text-center mb-2">
              {selectedBadge.description || "No description available"}
            </p>

            <div className="flex gap-2">
              {/* {selectedBadge.earned && (
                <button
                  onClick={() => setSelectedBadge(null)}
                  className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors cursor-pointer"
                >
                  Equip
                </button>
              )} */}
              <button
                onClick={() => setSelectedBadge(null)}
                className="flex-1 py-2 bg-gray-200 hover:bg-green-100 text-gray-900 rounded border border-gray-300 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="h-16" />
    </>
  );
}

export default Badges;
