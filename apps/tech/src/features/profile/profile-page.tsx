import { DefaultSkeleton, QueryState } from '@servicepro/app-kit';
import { session, useGetActiveCatalog, useGetMyTechnicianProfile } from '@servicepro/api-client';
import { Avatar, Button, Card, CategoryTile, DutyStatusBadge, Heading, PageHeader, Stack, Text, cn } from '@servicepro/ui';
import { Clock, IdCard, LogOut, Phone } from 'lucide-react';

const MAX_SKILL_LEVEL = 5;

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
  const category = (id: string) => catalog.data?.find((c) => c.id === id);

  return (
    <Stack gap={6}>
      <PageHeader title="Profile" description="Your skills and hours are set by the office. Ask them to change anything here." />
      <QueryState query={profile} loading={<DefaultSkeleton rows={3} />}>
        {(me) => (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
            <Card padding="none" className="overflow-hidden">
              <div data-surface="brand" className="surface-hero h-24" />
              <div className="flex flex-col items-center gap-3 px-5 pb-6 text-center">
                <Avatar name={me.fullName} size="xl" className="-mt-10 rounded-full ring-4 ring-surface" />
                <div className="flex flex-col items-center gap-2">
                  <Heading level={2} size="h2">
                    {me.fullName}
                  </Heading>
                  <DutyStatusBadge status={me.dutyStatus} size="sm" />
                </div>
                <ul className="flex w-full flex-col gap-2 border-t border-border pt-4 text-left">
                  <li className="flex items-center gap-3 text-sm text-foreground-secondary">
                    <Phone aria-hidden className="size-4 text-primary" />
                    <span className="tabular-nums">{me.phone}</span>
                  </li>
                  {me.employeeCode ? (
                    <li className="flex items-center gap-3 text-sm text-foreground-secondary">
                      <IdCard aria-hidden className="size-4 text-primary" />
                      Employee code {me.employeeCode}
                    </li>
                  ) : null}
                </ul>
                <Button variant="outline" size="lg" fullWidth onClick={() => void session.signOut()}>
                  <LogOut aria-hidden /> Sign out
                </Button>
              </div>
            </Card>

            <div className="flex flex-col gap-6 lg:col-span-2">
              <section aria-labelledby="skills" className="flex flex-col gap-3">
                <Heading level={2} size="h3" id="skills">
                  Skills
                </Heading>
                {me.skills.length === 0 ? (
                  <Card variant="sunken">
                    <Text variant="sm" tone="secondary">
                      No skills yet — the office adds them.
                    </Text>
                  </Card>
                ) : (
                  <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    {me.skills.map((skill) => {
                      const c = category(skill.categoryId);
                      return (
                        <li key={skill.categoryId}>
                          <Card className="flex h-full flex-col gap-3">
                            <CategoryTile code={c?.code} size="lg" className="w-full" />
                            <div className="flex flex-col gap-1">
                              <Text weight="semibold">{c?.name ?? '…'}</Text>
                              <span className="flex items-center gap-1" role="img" aria-label={`Skill level ${skill.level} of ${MAX_SKILL_LEVEL}`}>
                                {Array.from({ length: MAX_SKILL_LEVEL }, (_, i) => (
                                  <span key={i} className={cn('h-2 flex-1 rounded-pill', i < skill.level ? 'bg-primary' : 'bg-surface-sunken')} />
                                ))}
                              </span>
                              <Text variant="caption" tone="muted">
                                Level {skill.level}
                              </Text>
                            </div>
                          </Card>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section aria-labelledby="hours" className="flex flex-col gap-3">
                <Heading level={2} size="h3" id="hours">
                  Working hours
                </Heading>
                <Card padding="none">
                  {me.shifts.length === 0 ? (
                    <Text variant="sm" tone="secondary" className="p-4">
                      Not set — the office can add your shifts.
                    </Text>
                  ) : (
                    <ul className="divide-y divide-border">
                      {me.shifts.map((shift) => (
                        <li key={shift.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                          <span className="flex size-8 items-center justify-center rounded-full bg-hue-sky-subtle text-hue-sky-foreground">
                            <Clock aria-hidden className="size-4" />
                          </span>
                          <span className="flex-1 font-semibold text-foreground">{shift.day.charAt(0) + shift.day.slice(1).toLowerCase()}</span>
                          <span className="tabular-nums text-foreground-secondary">
                            {formatClock(shift.start)} – {formatClock(shift.end)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </section>
            </div>
          </div>
        )}
      </QueryState>
    </Stack>
  );
}
