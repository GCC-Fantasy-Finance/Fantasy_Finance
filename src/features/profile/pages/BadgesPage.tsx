import { getBadgesbyUserBadges } from "@/lib/userBadges";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";



function Badges() {

    const user = useAuth().user;
    const [badges, setBadges] = useState<any[]>([]);

    useEffect(() => {
        if (user) {
          getBadgesbyUserBadges(user.id).then((result) => {
                setBadges(result || []);
            });
        }
    }, [user]);
    
  return (
    <>
      <p className="text-gray-600">Your Badges</p>
      <div className="w-full flex flex-wrap gap-2">
        {badges.map((badge) => (
          <div key={badge.fixed_badge_id} className="w-fit flex flex-col items-center">
            <button
              type="button"
              className="w-32 h-32 cursor-pointer transition-all rounded border border-transparent hover:border-green-300 hover:shadow-sm hover:scale-[1.02] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 flex items-center justify-center"
              title="Click to select badge"
              aria-label={`Select badge ${badge.name}`}
            >
              {badge.image_path ? (
                <img src={badge.image_path} alt={badge.name} className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full rounded bg-gray-100 flex items-center justify-center text-xs text-gray-500">
                  Badge
                </div>
              )}
            </button>
            
          </div>
        ))}
      </div>
    </>
  );
}

export default Badges;