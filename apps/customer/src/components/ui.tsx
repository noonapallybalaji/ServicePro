import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';

import { colors, radius, space, type } from '@/lib/theme';

/*
 * The app's building blocks, matching the website's look (navy primary, orange accent, rounded
 * cards). Touch targets are at least 48 points high.
 */

type IconName = ComponentProps<typeof Ionicons>['name'];

type Variant = keyof typeof type;
type Tone = 'default' | 'secondary' | 'muted' | 'primary' | 'error' | 'success' | 'inverse';

const TONES: Record<Tone, string> = {
  default: colors.text,
  secondary: colors.textSecondary,
  muted: colors.textMuted,
  primary: colors.primary,
  error: colors.errorText,
  success: colors.successText,
  inverse: '#ffffff',
};

export function AppText({
  variant = 'body',
  tone = 'default',
  bold,
  center,
  style,
  children,
  numberOfLines,
}: {
  variant?: Variant;
  tone?: Tone;
  bold?: boolean;
  center?: boolean;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[type[variant], { color: TONES[tone] }, bold && { fontWeight: '700' }, center && { textAlign: 'center' }, style]}
      accessibilityRole={variant === 'title' || variant === 'h2' ? 'header' : undefined}
    >
      {children}
    </Text>
  );
}

type ButtonVariant = 'primary' | 'accent' | 'outline' | 'ghost' | 'danger';

const BUTTONS: Record<ButtonVariant, { bg: string; pressed: string; text: string; border?: string }> = {
  primary: { bg: colors.primary, pressed: colors.primaryPressed, text: '#ffffff' },
  accent: { bg: colors.accent, pressed: '#f07400', text: colors.accentText },
  outline: { bg: colors.surface, pressed: colors.sunken, text: colors.text, border: colors.borderStrong },
  ghost: { bg: 'transparent', pressed: colors.sunken, text: colors.primary },
  danger: { bg: colors.error, pressed: '#a61f15', text: '#ffffff' },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  small,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const look = BUTTONS[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: pressed ? look.pressed : look.bg, borderColor: look.border ?? 'transparent', opacity: disabled ? 0.5 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={look.text} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={small ? 16 : 19} color={look.text} /> : null}
          <Text style={[small ? type.small : type.body, { color: look.text, fontWeight: '700' }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Card({ children, style, onPress, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string }) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.background }, style]}
    >
      {children}
    </Pressable>
  );
}

export function Field({ label, hint, error, optional, children }: { label: string; hint?: string; error?: string; optional?: boolean; children: ReactNode }) {
  return (
    <View style={{ gap: space.xs + 2 }}>
      <AppText variant="small" bold>
        {label}
        {optional ? <AppText variant="small" tone="muted"> (optional)</AppText> : null}
      </AppText>
      {children}
      {error ? (
        <AppText variant="small" tone="error" style={{ marginTop: 2 }}>
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
    <View style={[styles.input, invalid && { borderColor: colors.error }, props.multiline && { alignItems: 'flex-start', paddingVertical: space.sm }]}>
      {icon ? <Ionicons name={icon} size={18} color={colors.textMuted} style={props.multiline ? { marginTop: 4 } : undefined} /> : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={[type.body, { flex: 1, color: colors.text, minHeight: props.multiline ? 64 : undefined, textAlignVertical: props.multiline ? 'top' : 'center' }, style]}
        {...props}
      />
    </View>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon?: IconName }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && { borderColor: colors.primary, backgroundColor: colors.primarySubtle }]}
    >
      {icon ? <Ionicons name={icon} size={15} color={selected ? colors.primarySubtleText : colors.textSecondary} /> : null}
      <Text style={[type.small, { fontWeight: '700', color: selected ? colors.primarySubtleText : colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

const NOTICES = {
  info: { bg: colors.primarySubtle, border: colors.primaryBorder, text: colors.primarySubtleText, icon: 'information-circle' as IconName },
  success: { bg: colors.successSubtle, border: '#b6dec4', text: colors.successText, icon: 'checkmark-circle' as IconName },
  warning: { bg: colors.warningSubtle, border: '#f3d08c', text: colors.warningText, icon: 'warning' as IconName },
  error: { bg: colors.errorSubtle, border: '#f4c3bd', text: colors.errorText, icon: 'alert-circle' as IconName },
};

export function Notice({ tone = 'info', title, description, action }: { tone?: keyof typeof NOTICES; title: string; description?: string; action?: ReactNode }) {
  const look = NOTICES[tone];
  return (
    <View accessibilityRole={tone === 'error' ? 'alert' : undefined} style={[styles.notice, { backgroundColor: look.bg, borderColor: look.border }]}>
      <Ionicons name={look.icon} size={20} color={look.text} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.small, { color: look.text, fontWeight: '700' }]}>{title}</Text>
        {description ? <Text style={[type.small, { color: look.text }]}>{description}</Text> : null}
        {action ? <View style={{ marginTop: space.sm, alignSelf: 'flex-start' }}>{action}</View> : null}
      </View>
    </View>
  );
}

export function Badge({ label, tone = 'primary' }: { label: string; tone?: 'primary' | 'success' | 'warning' | 'neutral' }) {
  const look = {
    primary: [colors.primarySubtle, colors.primarySubtleText],
    success: [colors.successSubtle, colors.successText],
    warning: [colors.warningSubtle, colors.warningText],
    neutral: [colors.sunken, colors.textSecondary],
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: look[0] }]}>
      <Text style={[type.caption, { color: look[1], fontWeight: '700' }]}>{label}</Text>
    </View>
  );
}

/** A heading for a block of content. */
export function SectionTitle({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm }}>
      <AppText variant="h3">{children}</AppText>
      {action}
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

export { Ionicons, type IconName };

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
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
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  code: { ...type.h2, letterSpacing: 10, textAlign: 'center', color: colors.text },
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
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
});
