import {
  getGetMyTicketQueryKey,
  getListMyTicketsQueryKey,
  isApiError,
  useGetMyTicket,
  useResolveMyTicket,
  useWriteToMyTicket,
  type CustomerMessageResponse,
} from '@servicepro/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale, tap } from '@/components/motion';
import { AppText, Badge, Button, Ionicons, Notice } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { TICKET_STATUS, topicOf } from '@/lib/support';
import { colors, fonts, radius, space, type } from '@/lib/theme';
import { pickPhotos, uploadTicketPhoto } from '@/lib/upload';

/** A help conversation as a chat: our replies on the left, the customer's on the right. Refreshes every 10 seconds. */
export default function HelpConversationScreen() {
  const { number } = useLocalSearchParams<{ number: string }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const ticket = useGetMyTicket(number, { query: { enabled: !!number, refetchInterval: 10_000 } });
  const write = useWriteToMyTicket({ mutation: { meta: { silent: true } } });
  const resolve = useResolveMyTicket({ mutation: { meta: { silent: true } } });
  const [draft, setDraft] = useState('');
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  const list = useRef<FlatList<CustomerMessageResponse>>(null);
  const messages = ticket.data?.messages ?? [];

  useEffect(() => {
    if (messages.length > 0) setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
  }, [messages.length]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getGetMyTicketQueryKey(number) });
    void queryClient.invalidateQueries({ queryKey: getListMyTicketsQueryKey() });
  };

  function send() {
    const message = draft.trim();
    if (!message) return;
    tap();
    write.mutate(
      { number, data: { message } },
      {
        onSuccess: () => {
          setDraft('');
          refresh();
        },
      },
    );
  }

  async function addPhoto() {
    const [photo] = await pickPhotos('library', 1);
    if (!photo) return;
    setPhotoNote('Uploading photo…');
    try {
      await uploadTicketPhoto(number, photo);
      setPhotoNote('Photo added. Our team can see it.');
      refresh();
    } catch (error) {
      setPhotoNote(isApiError(error) ? error.message : "Couldn't upload the photo.");
    }
  }

  const data = ticket.data;
  const topic = data ? topicOf(data.category) : null;
  const status = data ? TICKET_STATUS[data.status] : null;
  const resolved = data?.status === 'RESOLVED';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: topic ? topic.label : 'Help' }} />
      {data && status ? (
        <View style={styles.banner}>
          <AppText variant="caption" tone="muted">
            {data.number}
            {data.srNumber ? ` · booking ${data.srNumber}` : ''}
          </AppText>
          <Badge label={status.label} tone={status.tone} />
        </View>
      ) : null}

      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding: space.lg, gap: space.md, flexGrow: 1 }}
        renderItem={({ item, index }) => <Bubble message={item} index={index} />}
        ListEmptyComponent={ticket.isPending ? <AppText tone="muted" center>Loading…</AppText> : undefined}
        ListFooterComponent={
          <View style={{ gap: space.md, marginTop: space.sm }}>
            {photoNote ? <Notice tone="info" title={photoNote} /> : null}
            {data && !resolved && messages.length > 0 && messages[messages.length - 1]?.fromCustomer ? (
              <AppText variant="caption" tone="muted" center>
                Our team usually replies within a few hours.
              </AppText>
            ) : null}
            {data && !resolved ? (
              <Button
                small
                variant="ghost"
                icon="checkmark-done"
                label="My problem is solved"
                onPress={() =>
                  Alert.alert('Close this conversation?', 'You can always start a new one.', [
                    { text: 'Not yet', style: 'cancel' },
                    { text: 'Close it', onPress: () => resolve.mutate({ number }, { onSuccess: refresh }) },
                  ])
                }
              />
            ) : null}
          </View>
        }
      />

      {isApiError(write.error) ? (
        <View style={{ paddingHorizontal: space.lg }}>
          <Notice tone="error" title={write.error.message} />
        </View>
      ) : null}

      {resolved ? (
        <AppText variant="caption" tone="muted" center style={{ paddingVertical: space.sm }}>
          This conversation is closed. Write again to reopen it.
        </AppText>
      ) : null}
      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
        <PressableScale onPress={() => void addPhoto()} accessibilityLabel="Add a photo" hitSlop={8} style={styles.iconButton}>
          <Ionicons name="image-outline" size={22} color={colors.primary} />
        </PressableScale>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Write a message"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={2000}
          style={[type.body, styles.composerInput, { fontFamily: fonts.regular }]}
          accessibilityLabel="Message"
        />
        <PressableScale
          onPress={send}
          disabled={!draft.trim() || write.isPending}
          accessibilityLabel="Send"
          style={[styles.send, { opacity: draft.trim() ? 1 : 0.4 }]}
        >
          <Ionicons name="send" size={18} color="#ffffff" />
        </PressableScale>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message, index }: { message: CustomerMessageResponse; index: number }) {
  const mine = message.fromCustomer;
  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 40).duration(260)} style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 4 }}>
      {!mine ? (
        <AppText variant="caption" tone="muted" bold>
          {message.authorLabel}
        </AppText>
      ) : null}
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
        <AppText tone={mine ? 'inverse' : 'default'}>{message.body}</AppText>
      </View>
      <AppText variant="caption" tone="muted">
        {formatDateTime(message.sentAt)}
      </AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bubble: { maxWidth: '82%', paddingHorizontal: space.md + 2, paddingVertical: space.sm + 2, borderRadius: radius.card },
  mine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  theirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  composerInput: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: colors.background,
    color: colors.text,
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
