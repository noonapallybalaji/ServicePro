import { DefaultSkeleton, QueryState } from '@servicepro/app-kit';
import {
  getListNotificationTemplatesQueryKey,
  useListNotificationChannels,
  useListNotifications,
  useListNotificationTemplates,
  useUpdateNotificationTemplate,
  type TemplateResponse,
} from '@servicepro/api-client';
import { Alert, Badge, Button, Card, Checkbox, Field, Heading, Input, Text, Textarea, formatDateTime, toast } from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { humanize } from '../../components/common';

/**
 * Message wording (PLAN.md §11.2). WhatsApp templates must be approved by Meta and SMS
 * templates DLT-registered; once approved, put the provider's template name or flow ID here
 * so messages actually send.
 */
export function MessagesTab() {
  const templates = useListNotificationTemplates();
  const recent = useListNotifications({ take: 20 });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="flex flex-col gap-4 lg:col-span-2">
        <ChannelStatus />
        <QueryState query={templates} loading={<DefaultSkeleton rows={3} />}>
          {(list) => (
            <ul className="flex flex-col gap-4">
              {list.map((template) => (
                <li key={template.id}>
                  <TemplateCard template={template} />
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </section>
      <aside className="flex flex-col gap-3">
        <Heading level={2} size="h3">
          Recently sent
        </Heading>
        <QueryState query={recent} loading={<DefaultSkeleton rows={3} />}>
          {(list) => (
            <Card padding="none">
              <ul className="divide-y divide-border">
                {list.map((message) => (
                  <li key={message.id} className="flex flex-col gap-1 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge size="sm" tone={message.status === 'FAILED' ? 'error' : 'neutral'}>
                        {message.templateCode}
                      </Badge>
                      <Text variant="caption" tone="muted">
                        {formatDateTime(message.createdAt)}
                      </Text>
                    </div>
                    <Text variant="sm" className="line-clamp-3">
                      {message.renderedBody}
                    </Text>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </QueryState>
      </aside>
    </div>
  );
}

/** Says plainly whether customers really receive messages, or they only go to the server log. */
function ChannelStatus() {
  const status = useListNotificationChannels();
  if (!status.data) {
    return null;
  }

  const live = status.data.channels.filter((c) => c.live);
  const offline = status.data.channels.filter((c) => !c.live);
  const codesLive = live.length > 0;

  if (offline.length === 0) {
    return (
      <Alert
        tone="success"
        title="Messages are being delivered"
        description={`${live.map((c) => `${humanize(c.channel)} via ${c.provider ?? 'provider'}`).join(', ')}. Sign-in codes try ${humanize(status.data.otpChannel)} first.`}
      />
    );
  }

  return (
    <Alert
      tone={codesLive ? 'info' : 'warning'}
      title={codesLive ? `${offline.map((c) => humanize(c.channel)).join(', ')} not connected` : 'Messages are not being delivered yet'}
      description={
        codesLive
          ? `Messages on ${offline.map((c) => humanize(c.channel)).join(', ')} are only written to the server log. Sign-in codes are sent on ${live.map((c) => humanize(c.channel)).join(', ')}.`
          : 'No WhatsApp or SMS provider is connected, so customers receive nothing. Add the provider credentials on the server (see docs/DEPLOY-CLOUDFLARE-N8N.md) and the template names below.'
      }
    />
  );
}

function TemplateCard({ template }: { template: TemplateResponse }) {
  const [body, setBody] = useState(template.body);
  const [providerName, setProviderName] = useState(template.providerTemplateName ?? '');
  const [active, setActive] = useState(template.isActive);
  const queryClient = useQueryClient();
  const update = useUpdateNotificationTemplate({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListNotificationTemplatesQueryKey() });
        toast.success(`${template.code} saved`);
      },
    },
  });

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Text weight="semibold">{template.code}</Text>
        <Badge size="sm">{humanize(template.channel)}</Badge>
        <Badge size="sm" appearance="outline">
          {template.language}
        </Badge>
      </div>
      <Field label="Message" hint={`Placeholders: ${template.variables.map((v) => `{{${v}}}`).join(' ') || 'none'}`}>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      {template.channel === 'WHATS_APP' ? (
        <Field label="Approved WhatsApp template name" optional hint="Needed before messages can be sent through Meta.">
          <Input value={providerName} onChange={(e) => setProviderName(e.target.value)} />
        </Field>
      ) : null}
      {template.channel === 'SMS' ? (
        <Field label="MSG91 flow ID" optional hint="The flow linked to this message's DLT-registered template. Needed before SMS can be sent.">
          <Input value={providerName} onChange={(e) => setProviderName(e.target.value)} />
        </Field>
      ) : null}
      <Checkbox label="Active" checked={active} onCheckedChange={(v) => setActive(v === true)} />
      <Button size="sm" variant="outline" className="self-start" loading={update.isPending} onClick={() => update.mutate({ templateId: template.id, data: { body, providerTemplateName: providerName || null, isActive: active } })}>
        Save
      </Button>
    </Card>
  );
}
