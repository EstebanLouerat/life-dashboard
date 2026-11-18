import type { IconName, Tint } from "@/components/ui";
import type { SubscriptionCategory } from "@/lib/subscriptions";

/** Icon and colour per subscription category (also used by the cost breakdown). */
export const CATEGORY_STYLE: Record<SubscriptionCategory, { icon: IconName; color: Tint }> = {
  streaming: { icon: "tv-outline", color: "sommeil" },
  musique: { icon: "musical-notes-outline", color: "epargne" },
  logiciel: { icon: "code-slash-outline", color: "encre" },
  cloud: { icon: "cloud-outline", color: "eau" },
  jeux: { icon: "game-controller-outline", color: "sport" },
  presse: { icon: "newspaper-outline", color: "courses" },
  sport: { icon: "barbell-outline", color: "sport" },
  telephonie: { icon: "phone-portrait-outline", color: "sante" },
  autre: { icon: "ellipsis-horizontal", color: "encre" },
};
