import { supabase } from "../lib/supabase";

export type UserBadgeView = {
    fixed_badge_id: string;
    name: string;
    description?: string;
    image_path?: string;
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