import { Pressable, Text, View } from "react-native";
import { Link, type Href } from "expo-router";
import { Screen, useTheme } from "@/components/ui";

type Entry = { href: Href; glyph: string; title: string; subtitle: string };

/** Hub of every module, grouped by domain. Add new modules here. */
const SECTIONS: { title: string; entries: Entry[] }[] = [
  {
    title: "Santé",
    entries: [
      { href: "/modules/hair-care", glyph: "💊", title: "Hair care", subtitle: "Traitements, stock, rappels" },
      { href: "/modules/sport", glyph: "🤸", title: "Sport", subtitle: "Séance du jour" },
    ],
  },
  {
    title: "Maison",
    entries: [{ href: "/modules/courses", glyph: "🛒", title: "Courses", subtitle: "Menu de la semaine et liste" }],
  },
];

export default function ModulesScreen() {
  const t = useTheme();
  return (
    <Screen>
      {SECTIONS.map((section) => (
        <View key={section.title} style={{ gap: 8 }}>
          <Text style={{ color: t.muted, fontSize: 13, fontWeight: "600", textTransform: "uppercase" }}>
            {section.title}
          </Text>
          {section.entries.map((e) => (
            <Link key={e.title} href={e.href} asChild>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  padding: 16,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: t.border,
                  backgroundColor: t.card,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text style={{ fontSize: 26 }}>{e.glyph}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontSize: 16, fontWeight: "700" }}>{e.title}</Text>
                  <Text style={{ color: t.muted, fontSize: 13 }}>{e.subtitle}</Text>
                </View>
                <Text style={{ color: t.muted, fontSize: 18 }}>›</Text>
              </Pressable>
            </Link>
          ))}
        </View>
      ))}
    </Screen>
  );
}
