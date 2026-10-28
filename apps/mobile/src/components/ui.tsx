import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
  type TextInputProps,
} from "react-native";

/** Minimal design tokens. Replace with a real theme once screens settle. */
export function useTheme() {
  const dark = useColorScheme() === "dark";
  return {
    dark,
    bg: dark ? "#0F1115" : "#F6F7F9",
    card: dark ? "#1A1D23" : "#FFFFFF",
    text: dark ? "#ECEEF2" : "#14171C",
    muted: dark ? "#9AA1AD" : "#5B6270",
    accent: "#2F7DF6",
    good: "#1F9D61",
    warn: dark ? "#E0A33A" : "#B26A00",
    danger: dark ? "#F07575" : "#C93636",
    border: dark ? "#2A2F38" : "#E3E6EB",
  };
}

export function Screen({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.screen}>
      {children}
    </ScrollView>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
      {title ? <Text style={[styles.cardTitle, { color: t.text }]}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const t = useTheme();
  return <Text style={{ color: muted ? t.muted : t.text, fontSize: 15, lineHeight: 21 }}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  compact,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  const t = useTheme();
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        {
          backgroundColor: primary ? t.accent : "transparent",
          borderColor: primary ? t.accent : t.border,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? "#fff" : t.accent} />
      ) : (
        <Text style={{ color: primary ? "#fff" : t.text, fontWeight: "600", fontSize: 15 }}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: t.muted, fontSize: 13 }}>{label}</Text>
      <TextInput
        placeholderTextColor={t.muted}
        {...props}
        style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.bg }]}
      />
    </View>
  );
}

/** Multi-select variant of Chips. */
export function MultiChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T[];
  onChange: (v: T[]) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const active = value.includes(o.value);
        return (
          <Chip
            key={o.value}
            label={o.label}
            active={active}
            onPress={() => onChange(active ? value.filter((v) => v !== o.value) : [...value, o.value])}
          />
        );
      })}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, { borderColor: active ? t.accent : t.border, backgroundColor: active ? t.accent : "transparent" }]}
    >
      <Text style={{ color: active ? "#fff" : t.text, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

/** Coloured banner for alerts. */
export function Notice({ tone = "warn", children }: { tone?: "warn" | "danger" | "info"; children: ReactNode }) {
  const t = useTheme();
  const color = tone === "danger" ? t.danger : tone === "info" ? t.accent : t.warn;
  return (
    <View style={[styles.notice, { borderColor: color, backgroundColor: t.card }]}>
      <View style={[styles.noticeBar, { backgroundColor: color }]} />
      <Text style={{ color: t.text, fontSize: 14, lineHeight: 20, flex: 1 }}>{children}</Text>
    </View>
  );
}

/** Label + big value, laid out in a wrapping row by StatRow. */
export function Stat({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={{ color: t.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 18, fontWeight: "700" }}>{value}</Text>
    </View>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return <View style={styles.statRow}>{children}</View>;
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((o) => (
        <Chip key={o.value} label={o.label} active={o.value === value} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 10 },
  cardTitle: { fontSize: 17, fontWeight: "700" },
  button: { borderRadius: 10, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 16, alignItems: "center", minHeight: 46, justifyContent: "center" },
  buttonCompact: { paddingVertical: 8, paddingHorizontal: 12, minHeight: 40 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  notice: { flexDirection: "row", gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, overflow: "hidden" },
  noticeBar: { width: 4, borderRadius: 2 },
  stat: { minWidth: "45%", flexGrow: 1, gap: 2 },
  statRow: { flexDirection: "row", flexWrap: "wrap", rowGap: 12, columnGap: 12 },
});
