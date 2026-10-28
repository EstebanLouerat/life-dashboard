import * as Haptics from "expo-haptics";

/** Fire-and-forget haptics; a device without a vibrator must never throw. */
export const haptics = {
  tap: () => Haptics.selectionAsync().catch(() => {}),
  impact: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
};
