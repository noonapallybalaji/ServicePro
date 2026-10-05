import { DefaultSkeleton, QueryState } from '@servicepro/app-kit';
import {
  getListNotificationTemplatesQueryKey,
  useListNotifications,
  useListNotificationTemplates,
  useUpdateNotificationTemplate,
  type TemplateResponse,
} from '@servicepro/api-client';
import { Badge, Button, Card, Checkbox, Field, Heading, Input, Text, Textarea, formatDateTime, toast } from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { humanize } from '../../components/common';

/**
 * Message wording (PLAN.md §11.2). WhatsApp templates must be approved by Meta; once
 * approved, put the approved template name here so messages send through the Cloud API.
 */
export function MessagesTab() {
  const templates = useListNotificationTemplates();
  const recent = useListNotifications({ take: 20 });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="flex flex-col gap-4 lg:col-span-2">
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
      <Checkbox label="Active" checked={active} onCheckedChange={(v) => setActive(v === true)} />
      <Button size="sm" variant="outline" className="self-start" loading={update.isPending} onClick={() => update.mutate({ templateId: template.id, data: { body, providerTemplateName: providerName || null, isActive: active } })}>
        Save
      </Button>
    </Card>
  );
}
