import { useCallback, useState } from "react";
import { router, useFocusEffect, type Href } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { Card, ListRow, Screen, Txt, type Domain, type IconName } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { loadSubscriptions } from "@/lib/subscriptions";
import { loadWishlist } from "@/lib/wishlist";

type Entry = { href: Href; icon: IconName; domain?: Domain; title: string; subtitle: string };

/**
 * Everything that is not a daily tab: money, tools and settings. A new
 * module that has no domain tab gets a row here, never a new tab.
 */
export default function PlusScreen() {
  const db = useSQLiteContext();
  const [wish, setWish] = useState("Envies et épargne");
  const [subs, setSubs] = useState("Budget, prélèvements, résiliation");

  useFocusEffect(
    useCallback(() => {
      loadWishlist(db)
        .then((s) => {
          const wanted = s.items.filter((i) => i.status === "wanted").length;
          const goal = s.settings.monthlyGoalCents;
          setWish(
            `${wanted} envie${wanted > 1 ? "s" : ""}${goal ? ` · épargne ${formatCents(goal, true)} / mois` : ""}`,
          );
        })
        .catch(console.warn);
      loadSubscriptions(db)
        .then((list) => {
          const active = list.filter((s) => s.status === "active");
          const monthly = active.reduce((sum, s) => sum + s.monthlyCents, 0);
          setSubs(active.length ? `${active.length} actif${active.length > 1 ? "s" : ""} · ${formatCents(monthly, true)} / mois` : "Aucun abonnement suivi");
        })
        .catch(console.warn);
    }, [db]),
  );

  const entries: Entry[] = [
    { href: "/plus/wishlist", icon: "gift-outline", domain: "epargne", title: "Wishlist", subtitle: wish },
    { href: "/plus/abonnements", icon: "card-outline", domain: "epargne", title: "Abonnements", subtitle: subs },
    { href: "/plus/importer", icon: "download-outline", title: "Importer", subtitle: "Plan de courses ou séance (JSON)" },
    { href: "/plus/backlog", icon: "git-branch-outline", title: "Backlog", subtitle: "Idées, bugs, suivi GitHub" },
    { href: "/plus/reglages", icon: "options-outline", title: "Réglages", subtitle: "Serveur, hydratation, rappels" },
  ];

  return (
    <Screen title="Plus" domain="encre">
      <Card style={{ gap: 0 }}>
        {entries.map((e) => (
          <ListRow key={e.title} icon={e.icon} iconColor={e.domain} title={e.title} subtitle={e.subtitle} onPress={() => router.push(e.href)} />
        ))}
      </Card>
      <Txt variant="caption" tone="subtle" style={{ paddingHorizontal: 4 }}>
        Life Dashboard · usage personnel
      </Txt>
    </Screen>
  );
}
