import { useListMyTickets } from '@servicepro/api-client';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { RefreshControl, ScrollView, View } from 'react-native';

import { Appear, Skeleton } from '@/components/motion';
import { AppText, Badge, Button, Card, IconCircle, Ionicons, ListRow, SectionTitle } from '@/components/ui';
import { config } from '@/lib/config';
import { callSupport, formatDateTime, whatsappSupport } from '@/lib/format';
import { useCustomer } from '@/lib/session';
import { TICKET_STATUS, topicOf } from '@/lib/support';
import { colors, radius, space } from '@/lib/theme';

/** Help: the customer's conversations with our team, a new request, and quick ways to reach us. */
export default function HelpScreen() {
  const { customer } = useCustomer();
  const tickets = useListMyTickets({ query: { enabled: customer !== null, refetchInterval: 30_000 } });
  const list = [...(tickets.data ?? [])].sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));

  return (
    <ScrollView
      contentContainerStyle={{ padding: space.lg, gap: space.xl, paddingBottom: space.xxl }}
      refreshControl={customer ? <RefreshControl refreshing={tickets.isRefetching} onRefresh={() => void tickets.refetch()} /> : undefined}
    >
      <Appear>
        <Card style={{ backgroundColor: colors.primary, borderColor: colors.primary, gap: space.md }}>
          <AppText variant="h2" tone="inverse">
            How can we help?
          </AppText>
          <AppText tone="inverseMuted">Write to our team and we'll reply here, usually within a few hours.</AppText>
          <Button
            label="New help request"
            variant="accent"
            icon="create"
            onPress={() => router.push(customer ? '/support/new' : '/sign-in')}
            style={{ alignSelf: 'flex-start' }}
          />
        </Card>
      </Appear>

      <Appear index={1} style={{ flexDirection: 'row', gap: space.md }}>
        <QuickAction icon="call" label="Call us" onPress={callSupport} />
        <QuickAction icon="logo-whatsapp" label="WhatsApp" onPress={() => whatsappSupport()} />
        <QuickAction icon="help-circle" label="FAQs" onPress={() => void WebBrowser.openBrowserAsync(`${config.siteUrl}/faq`)} />
      </Appear>

      {customer ? (
        <View>
          <SectionTitle>Your conversations</SectionTitle>
          {tickets.isPending ? (
            <View style={{ gap: space.md }}>
              <Skeleton height={84} style={{ borderRadius: radius.card }} />
              <Skeleton height={84} style={{ borderRadius: radius.card }} />
            </View>
          ) : list.length === 0 ? (
            <Card flat style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xl }}>
              <Ionicons name="chatbubbles-outline" size={36} color={colors.primary} />
              <AppText tone="secondary" center>
                No conversations yet. Questions about a booking, a bill or a repair? Ask us here.
              </AppText>
            </Card>
          ) : (
            <View style={{ gap: space.md }}>
              {list.map((ticket, i) => {
                const topic = topicOf(ticket.category);
                const status = TICKET_STATUS[ticket.status];
                const unreadReply = ticket.lastMessageFromUs && ticket.status !== 'RESOLVED';
                return (
                  <Appear key={ticket.id} index={i}>
                    <Card onPress={() => router.push(`/support/${ticket.number}`)} accessibilityLabel={`${topic.label}, ${status.label}`} style={{ gap: space.sm }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                        <IconCircle name={topic.icon} size={40} tone={ticket.category === 'DAMAGE_OR_SAFETY' ? 'error' : 'primary'} />
                        <View style={{ flex: 1 }}>
                          <AppText bold>
                            {topic.label}
                            {ticket.srNumber ? ` · ${ticket.srNumber}` : ''}
                          </AppText>
                          <AppText variant="caption" tone="muted">
                            {formatDateTime(ticket.lastActivityAt)}
                          </AppText>
                        </View>
                        {unreadReply ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent }} accessibilityLabel="New reply" /> : null}
                      </View>
                      <AppText variant="small" tone="secondary" numberOfLines={2}>
                        {ticket.lastMessageFromUs ? 'Pakka Fix: ' : 'You: '}
                        {ticket.preview}
                      </AppText>
                      <Badge label={status.label} tone={status.tone} />
                    </Card>
                  </Appear>
                );
              })}
            </View>
          )}
        </View>
      ) : (
        <Card style={{ gap: space.md }}>
          <AppText variant="h3">Sign in to see your conversations</AppText>
          <Button label="Sign in" onPress={() => router.push('/sign-in')} />
        </Card>
      )}

      <Card style={{ paddingVertical: space.xs }}>
        <ListRow icon="document-text" label="Terms" onPress={() => void WebBrowser.openBrowserAsync(`${config.siteUrl}/terms`)} />
        <ListRow icon="shield-checkmark" label="Privacy" onPress={() => void WebBrowser.openBrowserAsync(`${config.siteUrl}/privacy`)} />
        <ListRow icon="refresh-circle" label="Cancellation and refunds" onPress={() => void WebBrowser.openBrowserAsync(`${config.siteUrl}/cancellation-and-refunds`)} last />
      </Card>
    </ScrollView>
  );
}

function QuickAction({ icon, label, onPress }: { icon: Parameters<typeof IconCircle>[0]['name']; label: string; onPress: () => void }) {
  return (
    <Card onPress={onPress} accessibilityLabel={label} style={{ flex: 1, alignItems: 'center', gap: space.sm, paddingVertical: space.lg }}>
      <IconCircle name={icon} size={44} tone={icon === 'logo-whatsapp' ? 'success' : 'primary'} />
      <AppText variant="small" bold>
        {label}
      </AppText>
    </Card>
  );
}
