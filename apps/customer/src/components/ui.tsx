import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale, tap } from '@/components/motion';
import { colors, fonts, isDark, radius, shadow, space, type } from '@/lib/theme';

/*
 * The app's building blocks, matching the website (navy primary, orange accent, Manrope, rounded
 * cards with soft shadows). Touch targets are at least 48 points; everything that responds to a
 * tap presses in slightly.
 */

type IconName = ComponentProps<typeof Ionicons>['name'];

type Variant = keyof typeof type;
type Tone = 'default' | 'secondary' | 'muted' | 'primary' | 'accent' | 'error' | 'success' | 'inverse' | 'inverseMuted';

const TONES: Record<Tone, string> = {
  default: colors.text,
  secondary: colors.textSecondary,
  muted: colors.textMuted,
  primary: colors.primary,
  accent: colors.accentSubtleText,
  error: colors.errorText,
  success: colors.successText,
  inverse: '#ffffff',
  inverseMuted: 'rgba(255,255,255,0.78)',
};

export function AppText({
  variant = 'body',
  tone = 'default',
  bold,
  semibold,
  center,
  style,
  children,
  numberOfLines,
}: {
  variant?: Variant;
  tone?: Tone;
  bold?: boolean;
  semibold?: boolean;
  center?: boolean;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        type[variant],
        { color: TONES[tone] },
        bold && { fontFamily: fonts.bold },
        semibold && { fontFamily: fonts.semibold },
        center && { textAlign: 'center' },
        style,
      ]}
      accessibilityRole={variant === 'display' || variant === 'title' || variant === 'h2' ? 'header' : undefined}
    >
      {children}
    </Text>
  );
}

type ButtonVariant = 'primary' | 'accent' | 'outline' | 'ghost' | 'danger' | 'light';

const BUTTONS: Record<ButtonVariant, { bg: string; text: string; border?: string }> = {
  primary: { bg: colors.primary, text: '#ffffff' },
  accent: { bg: colors.accent, text: colors.accentText },
  outline: { bg: colors.surface, text: colors.text, border: colors.borderStrong },
  ghost: { bg: 'transparent', text: colors.primary },
  danger: { bg: colors.error, text: '#ffffff' },
  light: { bg: 'rgba(255,255,255,0.14)', text: '#ffffff', border: 'rgba(255,255,255,0.28)' },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  trailingIcon,
  loading,
  disabled,
  small,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  trailingIcon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const look = BUTTONS[variant];
  const inactive = disabled || loading;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      haptic
      style={[styles.button, small && styles.buttonSmall, { backgroundColor: look.bg, borderColor: look.border ?? 'transparent', opacity: disabled ? 0.45 : 1 }, style]}
    >
      {loading ? (
        <ActivityIndicator color={look.text} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={small ? 16 : 19} color={look.text} /> : null}
          <Text style={[small ? type.small : type.body, { color: look.text, fontFamily: fonts.bold }]}>{label}</Text>
          {trailingIcon ? <Ionicons name={trailingIcon} size={small ? 16 : 18} color={look.text} /> : null}
        </>
      )}
    </PressableScale>
  );
}

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
  flat,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  flat?: boolean;
}) {
  const base = [styles.card, !flat && shadow.card, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} scaleTo={0.98} style={base}>
      {children}
    </PressableScale>
  );
}

export function Field({ label, hint, error, optional, children }: { label: string; hint?: string; error?: string; optional?: boolean; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="small" semibold>
        {label}
        {optional ? <AppText variant="small" tone="muted"> (optional)</AppText> : null}
      </AppText>
      {children}
      {error ? (
        <AppText variant="small" tone="error">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="small" tone="muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

export function Input({ invalid, icon, style, ...props }: TextInputProps & { invalid?: boolean; icon?: IconName }) {
  return (
    <View style={[styles.input, invalid && { borderColor: colors.error }, props.multiline && { alignItems: 'flex-start', paddingVertical: space.md }]}>
      {icon ? <Ionicons name={icon} size={19} color={colors.textMuted} style={props.multiline ? { marginTop: 2 } : undefined} /> : null}
      <TextInput
        keyboardAppearance={isDark ? 'dark' : 'light'}
        placeholderTextColor={colors.textMuted}
        style={[type.body, { flex: 1, color: colors.text, paddingVertical: 0, minHeight: props.multiline ? 72 : undefined, textAlignVertical: props.multiline ? 'top' : 'center' }, style]}
        {...props}
      />
    </View>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon?: IconName }) {
  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={() => {
        tap();
        onPress();
      }}
      style={[styles.chip, selected && { borderColor: colors.primary, backgroundColor: colors.primarySubtle }]}
    >
      {icon ? <Ionicons name={selected ? 'checkmark-circle' : icon} size={16} color={selected ? colors.primary : colors.textSecondary} /> : null}
      <Text style={[type.small, { fontFamily: fonts.semibold, color: selected ? colors.primarySubtleText : colors.textSecondary }]}>{label}</Text>
    </PressableScale>
  );
}

const NOTICES = {
  info: { bg: colors.primarySubtle, border: colors.primaryBorder, text: colors.primarySubtleText, icon: 'information-circle' as IconName },
  success: { bg: colors.successSubtle, border: colors.successBorder, text: colors.successText, icon: 'checkmark-circle' as IconName },
  warning: { bg: colors.warningSubtle, border: colors.warningBorder, text: colors.warningText, icon: 'warning' as IconName },
  error: { bg: colors.errorSubtle, border: colors.errorBorder, text: colors.errorText, icon: 'alert-circle' as IconName },
};

export function Notice({ tone = 'info', title, description, action }: { tone?: keyof typeof NOTICES; title: string; description?: string; action?: ReactNode }) {
  const look = NOTICES[tone];
  return (
    <View accessibilityRole={tone === 'error' ? 'alert' : undefined} style={[styles.notice, { backgroundColor: look.bg, borderColor: look.border }]}>
      <Ionicons name={look.icon} size={20} color={look.text} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.small, { color: look.text, fontFamily: fonts.bold }]}>{title}</Text>
        {description ? <Text style={[type.small, { color: look.text }]}>{description}</Text> : null}
        {action ? <View style={{ marginTop: space.sm, alignSelf: 'flex-start' }}>{action}</View> : null}
      </View>
    </View>
  );
}

export type BadgeTone = 'primary' | 'success' | 'warning' | 'neutral' | 'accent' | 'error';

const BADGES: Record<BadgeTone, [string, string]> = {
  primary: [colors.primarySubtle, colors.primarySubtleText],
  success: [colors.successSubtle, colors.successText],
  warning: [colors.warningSubtle, colors.warningText],
  neutral: [colors.sunken, colors.textSecondary],
  accent: [colors.accentSubtle, colors.accentSubtleText],
  error: [colors.errorSubtle, colors.errorText],
};

export function Badge({ label, tone = 'primary', icon }: { label: string; tone?: BadgeTone; icon?: IconName }) {
  const [bg, fg] = BADGES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Text style={[type.caption, { color: fg, fontFamily: fonts.bold }]}>{label}</Text>
    </View>
  );
}

/** A heading for a block of content, with an optional action on the right ("See all"). */
export function SectionTitle({ children, action, onAction }: { children: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md }}>
      <AppText variant="h2">{children}</AppText>
      {action && onAction ? (
        <PressableScale onPress={onAction} hitSlop={10} accessibilityRole="button">
          <AppText variant="small" tone="primary" bold>
            {action}
          </AppText>
        </PressableScale>
      ) : null}
    </View>
  );
}

/** The one-time code: a single field the phone can fill from the SMS. */
export function CodeInput({ length, value, onChange }: { length: number; value: string; onChange: (code: string) => void }) {
  return (
    <TextInput
      accessibilityLabel="One-time code"
      value={value}
      onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, length))}
      keyboardType="number-pad"
      keyboardAppearance={isDark ? 'dark' : 'light'}
      textContentType="oneTimeCode"
      autoComplete="sms-otp"
      maxLength={length}
      autoFocus
      placeholder={'•'.repeat(length)}
      placeholderTextColor={colors.borderStrong}
      style={[styles.input, styles.code]}
    />
  );
}

/** A round tinted icon, for list rows and cards. */
export function IconCircle({ name, size = 44, tone = 'primary' }: { name: IconName; size?: number; tone?: BadgeTone }) {
  const [bg, fg] = BADGES[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={name} size={size * 0.48} color={fg} />
    </View>
  );
}

/** Nothing to show yet: an icon, a line of text and what to do next. */
export function EmptyState({ icon, title, description, action }: { icon: IconName; title: string; description?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.xl }}>
      <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primarySubtle, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={40} color={colors.primary} />
      </View>
      <AppText variant="h2" center>
        {title}
      </AppText>
      {description ? (
        <AppText tone="secondary" center>
          {description}
        </AppText>
      ) : null}
      {action}
    </View>
  );
}

/** The main action, fixed above the bottom edge of the screen. */
export function BottomBar({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, space.md) }]}>{children}</View>;
}

/** A tappable settings-style row. */
export function ListRow({ icon, label, detail, onPress, last, danger }: { icon: IconName; label: string; detail?: string; onPress: () => void; last?: boolean; danger?: boolean }) {
  return (
    <PressableScale accessibilityRole="button" onPress={onPress} scaleTo={0.99} style={[styles.row, !last && styles.rowDivider]}>
      <IconCircle name={icon} size={36} tone={danger ? 'error' : 'primary'} />
      <View style={{ flex: 1 }}>
        <AppText semibold tone={danger ? 'error' : 'default'}>
          {label}
        </AppText>
        {detail ? (
          <AppText variant="caption" tone="muted">
            {detail}
          </AppText>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </PressableScale>
  );
}

export { Ionicons, type IconName };

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: radius.control,
    borderWidth: 1,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonSmall: { minHeight: 40, paddingHorizontal: space.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  code: { fontSize: 24, fontFamily: fonts.bold, letterSpacing: 12, textAlign: 'center', color: colors.text },
  chip: {
    minHeight: 40,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  notice: { flexDirection: 'row', gap: space.sm + 2, padding: space.md, borderRadius: radius.control, borderWidth: 1 },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  bottomBar: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: space.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60, paddingVertical: space.sm },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
});
