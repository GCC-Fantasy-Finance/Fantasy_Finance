import { supabase } from "../lib/supabase";

export type UserBadgeView = {
    fixed_badge_id: string;
    name: string;
    description?: string;
    image_path?: string;
};

export type BadgeWithEarned = UserBadgeView & {
    earned: boolean;
};

function toBadgeImageUrl(imagePath?: string) {
    const rawPath = String(imagePath ?? "").trim();
    if (!rawPath) return "";

    if (/^https?:\/\//i.test(rawPath)) {
        return rawPath;
    }

    const normalizedPath = rawPath.replace(/^\/+/, "");

    const publicBadgesIndex = normalizedPath.indexOf("public/badges/");
    if (publicBadgesIndex >= 0) {
        const trimmed = normalizedPath.slice(publicBadgesIndex + "public/".length);
        return `/${trimmed}`;
    }

    const badgesIndex = normalizedPath.indexOf("badges/");
    if (badgesIndex >= 0) {
        const trimmed = normalizedPath.slice(badgesIndex);
        return `/${trimmed}`;
    }

    if (normalizedPath.startsWith("public/")) {
        return `/${normalizedPath.replace(/^public\//, "")}`;
    }

    if (!normalizedPath.startsWith("/")) {
        return `/${normalizedPath}`;
    }

    return normalizedPath;
}

export async function getAllFixedBadges(): Promise<UserBadgeView[]> {
    const { data: fixedBadges, error } = await supabase
        .from("Fixed Badges")
        .select("id,title,description,image_path")
        .order("id", { ascending: true });

    if (error) {
        console.error("Error fetching fixed badges:", error);
        return [];
    }

    return (fixedBadges ?? []).map((badge: any) => ({
        fixed_badge_id: String(badge.id),
        name: String(badge.title ?? "Badge"),
        description: String(badge.description ?? ""),
        image_path: toBadgeImageUrl(String(badge.image_path ?? "")),
    }));
}

export async function getAllBadgesWithEarned(userId: string): Promise<BadgeWithEarned[]> {
    const allBadges = await getAllFixedBadges();

    const { data: userBadges, error: userBadgesError } = await supabase
        .from("User Badges")
        .select("fixed_badge_id")
        .eq("user_id", userId);

    if (userBadgesError) {
        console.error("Error fetching user badges:", userBadgesError);
        return allBadges.map((badge) => ({ ...badge, earned: false }));
    }

    const earnedBadgeIds = new Set(
        (userBadges ?? [])
            .map((row: any) => String(row.fixed_badge_id))
    );

    return allBadges.map((badge) => ({
        ...badge,
        earned: earnedBadgeIds.has(badge.fixed_badge_id),
    }));
}

export async function getBadgesbyUserBadges(userId: string): Promise<UserBadgeView[]> {
    const { data: userBadges, error: userBadgesError } = await supabase
        .from("User Badges")
        .select("fixed_badge_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

    if (userBadgesError) {
        console.error("Error fetching user badges:", userBadgesError);
        return [];
    }

    const badgeIds = (userBadges ?? [])
        .map((row: any) => Number(row.fixed_badge_id))
        .filter((badgeId) => Number.isFinite(badgeId));

    if (badgeIds.length === 0) {
        return [];
    }

    const { data: fixedBadges, error: fixedBadgesError } = await supabase
        .from("Fixed Badges")
        .select("id,title,description,image_path")
        .in("id", badgeIds);

    if (fixedBadgesError) {
        console.error("Error fetching fixed badges:", fixedBadgesError);
        return [];
    }

    const fixedBadgesById = new Map<number, any>();
    for (const badge of fixedBadges ?? []) {
        fixedBadgesById.set(Number((badge as any).id), badge);
    }

    return badgeIds
        .map((badgeId) => {
            const fixedBadge = fixedBadgesById.get(badgeId);
            if (!fixedBadge) return null;

            return {
                fixed_badge_id: String(fixedBadge.id),
                name: String(fixedBadge.title ?? "Badge"),
                description: String(fixedBadge.description ?? ""),
                image_path: toBadgeImageUrl(String(fixedBadge.image_path ?? "")),
            } as UserBadgeView;
        })
        .filter((badge): badge is UserBadgeView => badge != null);
}