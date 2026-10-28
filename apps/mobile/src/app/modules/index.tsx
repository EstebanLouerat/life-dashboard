import { View } from "react-native";
import Animated from "react-native-reanimated";
import { router, type Href } from "expo-router";
import {
  elevation,
  entering,
  Icon,
  IconTile,
  PressableScale,
  radius,
  Screen,
  SectionTitle,
  space,
  Txt,
  useTheme,
  type IconName,
  type ModuleColor,
} from "@/components/ui";
import { haptics } from "@/lib/haptics";

type Entry = { href: Href; icon: IconName; color: ModuleColor; title: string; subtitle: string };

/** Hub of every module, grouped by domain. Add new modules here, never as a new tab. */
const SECTIONS: { title: string; entries: Entry[] }[] = [
  {
    title: "Santé",
    entries: [
      { href: "/modules/hair-care", icon: "medkit", color: "care", title: "Hair care", subtitle: "Traitements, stock, rappels" },
      { href: "/modules/sport", icon: "barbell", color: "sport", title: "Sport", subtitle: "Séance du jour" },
    ],
  },
  {
    title: "Maison",
    entries: [{ href: "/modules/courses", icon: "cart", color: "groceries", title: "Courses", subtitle: "Menu et liste de la semaine" }],
  },
];

export default function ModulesScreen() {
  const t = useTheme();
  let position = 0;
  return (
    <Screen title="Modules" subtitle="Tout ce que l'app sait faire">
      {SECTIONS.map((section) => (
        <View key={section.title} style={{ gap: space.md }}>
          <SectionTitle>{section.title}</SectionTitle>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
            {section.entries.map((e) => (
              <Animated.View key={e.title} entering={entering(position++)} style={{ flexBasis: "46%", flexGrow: 1 }}>
                <PressableScale
                  accessibilityRole="link"
                  accessibilityLabel={`${e.title}, ${e.subtitle}`}
                  onPress={() => {
                    haptics.tap();
                    router.push(e.href);
                  }}
                  style={[
                    {
                      minHeight: 150,
                      padding: space.lg,
                      borderRadius: radius.lg,
                      backgroundColor: t.surface,
                      borderWidth: t.dark ? 1 : 0,
                      borderColor: t.border,
                      justifyContent: "space-between",
                      gap: space.md,
                    },
                    elevation(t),
                  ]}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <IconTile icon={e.icon} color={e.color} size={48} />
                    <Icon name="arrow-forward" size={18} color={t.textMuted} />
                  </View>
                  <View style={{ gap: 2 }}>
                    <Txt variant="headline">{e.title}</Txt>
                    <Txt variant="caption" tone="muted">
                      {e.subtitle}
                    </Txt>
                  </View>
                </PressableScale>
              </Animated.View>
            ))}
          </View>
        </View>
      ))}
    </Screen>
  );
}
