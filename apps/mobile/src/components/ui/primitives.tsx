import type { ComponentProps, ReactNode } from "react";
import { Text, View, type TextProps } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { radius, space, tint, typography, useTheme, type Tint, type TypographyVariant } from "./theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];

type Tone = "default" | "muted" | "primary" | "success" | "warning" | "danger" | "inverse";

export function Txt({
  variant = "body",
  tone = "default",
  color,
  style,
  ...rest
}: TextProps & { variant?: TypographyVariant; tone?: Tone; color?: string }) {
  const t = useTheme();
  const toneColor = {
    default: t.text,
    muted: t.textMuted,
    primary: t.primaryText,
    success: t.success,
    warning: t.warning,
    danger: t.danger,
    inverse: t.onHero,
  }[tone];
  return <Text {...rest} style={[typography[variant], { color: color ?? toneColor }, style]} />;
}

/** Kept for older call sites: a paragraph, optionally muted. */
export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Txt tone={muted ? "muted" : "default"}>{children}</Txt>;
}

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const t = useTheme();
  return <Ionicons name={name} size={size} color={color ?? t.text} accessibilityElementsHidden importantForAccessibility="no" />;
}

/** Rounded square with a soft tint behind a solid icon. Decorative. */
export function IconTile({ icon, color = "primary", size = 40 }: { icon: IconName; color?: Tint; size?: number }) {
  const t = useTheme();
  const c = tint(t, color);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        backgroundColor: c.soft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name={icon} size={size * 0.5} color={c.solid} />
    </View>
  );
}

export function Badge({ label, color = "primary", icon }: { label: string; color?: Tint; icon?: IconName }) {
  const t = useTheme();
  const c = tint(t, color);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        alignSelf: "flex-start",
        backgroundColor: c.soft,
        borderRadius: radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      {icon ? <Icon name={icon} size={14} color={c.solid} /> : null}
      <Txt variant="caption" color={c.solid} style={{ fontFamily: typography.overline.fontFamily }}>
        {label}
      </Txt>
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.xs }}>
      <Txt variant="overline" tone="muted" accessibilityRole="header">
        {children}
      </Txt>
      {right}
    </View>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.border }} />;
}

const NOTICE_ICON: Record<"info" | "success" | "warning" | "danger", IconName> = {
  info: "information-circle",
  success: "checkmark-circle",
  warning: "alert-circle",
  danger: "warning",
};

export function Notice({
  tone = "warning",
  title,
  children,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: string;
  children: ReactNode;
}) {
  const t = useTheme();
  const c = tint(t, tone === "info" ? "primary" : tone);
  return (
    <View
      accessibilityRole={tone === "warning" || tone === "danger" ? "alert" : undefined}
      style={{ flexDirection: "row", gap: 10, backgroundColor: c.soft, borderRadius: radius.md, padding: space.md }}
    >
      <Icon name={NOTICE_ICON[tone]} size={20} color={c.solid} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <Txt variant="bodyStrong">{title}</Txt> : null}
        <Txt variant="callout">{children}</Txt>
      </View>
    </View>
  );
}

export function Stat({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: Tint }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexBasis: "46%",
        flexGrow: 1,
        backgroundColor: t.surfaceAlt,
        borderRadius: radius.md,
        padding: space.md,
        gap: 2,
      }}
    >
      <Txt variant="caption" tone="muted">
        {label}
      </Txt>
      <Txt variant="title" color={color ? tint(t, color).solid : undefined}>
        {value}
      </Txt>
      {hint ? (
        <Txt variant="caption" tone="muted">
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>{children}</View>;
}

export function EmptyState({ icon, title, body }: { icon: IconName; title: string; body?: string }) {
  return (
    <View style={{ alignItems: "center", gap: space.sm, paddingVertical: space.lg }}>
      <IconTile icon={icon} size={52} />
      <Txt variant="headline">{title}</Txt>
      {body ? (
        <Txt tone="muted" style={{ textAlign: "center" }}>
          {body}
        </Txt>
      ) : null}
    </View>
  );
}
