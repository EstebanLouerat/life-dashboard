import type { IconName, Tint } from "@/components/ui";
import type { SubscriptionCategory } from "@/lib/subscriptions";

/** Icon and colour per subscription category (also used by the cost breakdown). */
export const CATEGORY_STYLE: Record<SubscriptionCategory, { icon: IconName; color: Tint }> = {
  streaming: { icon: "tv-outline", color: "sleep" },
  musique: { icon: "musical-notes-outline", color: "subs" },
  logiciel: { icon: "code-slash-outline", color: "primary" },
  cloud: { icon: "cloud-outline", color: "water" },
  jeux: { icon: "game-controller-outline", color: "sport" },
  presse: { icon: "newspaper-outline", color: "wish" },
  sport: { icon: "barbell-outline", color: "groceries" },
  telephonie: { icon: "phone-portrait-outline", color: "care" },
  autre: { icon: "ellipsis-horizontal", color: "settings" },
};
