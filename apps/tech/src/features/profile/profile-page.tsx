import { DefaultSkeleton, QueryState } from '@servicepro/app-kit';
import { session, useGetActiveCatalog, useGetMyTechnicianProfile } from '@servicepro/api-client';
import { Avatar, Badge, Button, Card, DutyStatusBadge, Heading, Stack, Text } from '@servicepro/ui';
import { LogOut } from 'lucide-react';

function formatClock(time: string) {
  const [h = '0', m = '0'] = time.split(':');
  const date = new Date();
  date.setHours(Number(h), Number(m));
  return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

/** Read-only profile: skills and shifts are managed by the office. */
export function ProfilePage() {
  const profile = useGetMyTechnicianProfile();
  const catalog = useGetActiveCatalog();
  const categoryName = (id: string) => catalog.data?.find((c) => c.id === id)?.name ?? '…';

  return (
    <Stack gap={6}>
      <Heading level={1} size="h2">
        Profile
      </Heading>
      <QueryState query={profile} loading={<DefaultSkeleton rows={3} />}>
        {(me) => (
          <Stack gap={4}>
            <Card className="flex items-center gap-4">
              <Avatar name={me.fullName} size="xl" />
              <div className="flex min-w-0 flex-col gap-1">
                <Text variant="body-lg" weight="semibold">
                  {me.fullName}
                </Text>
                <Text variant="sm" tone="secondary">
                  {me.phone}
                  {me.employeeCode ? ` · ${me.employeeCode}` : ''}
                </Text>
                <DutyStatusBadge status={me.dutyStatus} size="sm" />
              </div>
            </Card>

            <Card className="flex flex-col gap-3">
              <Text variant="overline" tone="muted">
                Skills
              </Text>
              <div className="flex flex-wrap gap-2">
                {me.skills.map((skill) => (
                  <Badge key={skill.categoryId} tone="primary">
                    {categoryName(skill.categoryId)} · level {skill.level}
                  </Badge>
                ))}
              </div>
            </Card>

            <Card className="flex flex-col gap-3">
              <Text variant="overline" tone="muted">
                Working hours
              </Text>
              {me.shifts.length === 0 ? (
                <Text variant="sm" tone="secondary">
                  Not set — the office can add your shifts.
                </Text>
              ) : (
                <ul className="flex flex-col gap-1">
                  {me.shifts.map((shift) => (
                    <li key={shift.id} className="flex justify-between text-sm">
                      <span>{shift.day.charAt(0) + shift.day.slice(1).toLowerCase()}</span>
                      <span className="tabular-nums text-foreground-secondary">
                        {formatClock(shift.start)} – {formatClock(shift.end)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Button variant="outline" size="lg" onClick={() => void session.signOut()}>
              <LogOut aria-hidden /> Sign out
            </Button>
          </Stack>
        )}
      </QueryState>
    </Stack>
  );
}
