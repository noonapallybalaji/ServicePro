import { DefaultSkeleton, QueryState } from '@servicepro/app-kit';
import {
  getGetTechnicianQueryKey,
  useAddTechnicianTimeOff,
  useGetActiveCatalog,
  useGetTechnician,
  useListServiceAreas,
  useListServiceRequests,
  useRemoveTechnicianTimeOff,
  useSetTechnicianDutyStatus,
  useSetTechnicianServiceAreas,
  useSetTechnicianShifts,
  useSetTechnicianSkills,
  useUpdateTechnician,
  type ShiftInput,
  type SkillInput,
  type TechnicianDutyStatus,
  type TechnicianResponse,
} from '@servicepro/api-client';
import {
  Avatar,
  Button,
  Card,
  Checkbox,
  DutyStatusBadge,
  EmptyState,
  Field,
  Heading,
  IconButton,
  Input,
  PageHeader,
  Select,
  Stack,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
  formatDateTime,
  toast,
} from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Inbox, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';

import { paths } from '../../app/paths';
import { BackLink } from '../../components/common';
import { RequestList } from '../../components/request-list';
import { fromLocalInput } from '../requests/request-dialogs';
import { AreasEditor, ProfileFields, SkillsEditor, type ProfileDraft, toProfileInput } from './technician-form';

const WEEK = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;

export function TechnicianDetailPage() {
  const { technicianId = '' } = useParams();
  const technician = useGetTechnician(technicianId);
  return (
    <Stack gap={6}>
      <BackLink to={paths.technicians} label="Technicians" />
      <QueryState query={technician} loading={<DefaultSkeleton rows={3} />} errorTitle="Couldn't open this technician">
        {(data) => <TechnicianDetail technician={data} />}
      </QueryState>
    </Stack>
  );
}

function useRefresh(id: string) {
  const queryClient = useQueryClient();
  return (updated?: TechnicianResponse) => {
    if (updated) queryClient.setQueryData(getGetTechnicianQueryKey(id), updated);
    return queryClient.invalidateQueries({ queryKey: ['/api/v1/admin/technicians'] });
  };
}

function TechnicianDetail({ technician }: { technician: TechnicianResponse }) {
  const jobs = useListServiceRequests({ technicianId: technician.id, pageSize: 20 });
  const refresh = useRefresh(technician.id);
  const setDuty = useSetTechnicianDutyStatus({ mutation: { onSuccess: (t) => refresh(t) } });

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar name={technician.fullName} size="lg" /> {technician.fullName}
          </span>
        }
        description={`${technician.phone}${technician.employeeCode ? ` · ${technician.employeeCode}` : ''} · ${technician.completedJobs} jobs done`}
        actions={
          <div className="flex items-center gap-3">
            <DutyStatusBadge status={technician.dutyStatus} />
            <Select
              aria-label="Set duty status"
              value={technician.dutyStatus}
              disabled={!technician.isActive || setDuty.isPending}
              onChange={(e) => setDuty.mutate({ technicianId: technician.id, data: { status: e.target.value as TechnicianDutyStatus } })}
            >
              <option value="AVAILABLE">Available</option>
              <option value="ON_JOB">On a job</option>
              <option value="ON_BREAK">On break</option>
              <option value="OFF_DUTY">Off duty</option>
            </Select>
          </div>
        }
      />

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="skills">Skills & areas</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <ProfileTab technician={technician} />
        </TabsContent>
        <TabsContent value="skills">
          <SkillsTab technician={technician} />
        </TabsContent>
        <TabsContent value="schedule">
          <ScheduleTab technician={technician} />
        </TabsContent>
        <TabsContent value="jobs">
          <QueryState query={jobs} loading={<DefaultSkeleton rows={2} />}>
            {(data) =>
              data.items.length === 0 ? (
                <Card>
                  <EmptyState size="compact" icon={Inbox} title="No jobs assigned yet" />
                </Card>
              ) : (
                <RequestList requests={data.items} />
              )
            }
          </QueryState>
        </TabsContent>
      </Tabs>
    </>
  );
}

function ProfileTab({ technician }: { technician: TechnicianResponse }) {
  const [draft, setDraft] = useState<ProfileDraft>({
    fullName: technician.fullName,
    phone: technician.phone,
    employeeCode: technician.employeeCode ?? '',
    employmentType: technician.employmentType,
    maxJobsPerDay: String(technician.maxJobsPerDay),
    commissionType: technician.commissionType,
    commissionValue: String(technician.commissionValue),
    homeLatitude: technician.homeLatitude?.toString() ?? '',
    homeLongitude: technician.homeLongitude?.toString() ?? '',
  });
  const [active, setActive] = useState(technician.isActive);
  const refresh = useRefresh(technician.id);
  const update = useUpdateTechnician({
    mutation: {
      onSuccess: async (t) => {
        await refresh(t);
        toast.success('Profile saved');
      },
    },
  });

  return (
    <Card className="flex flex-col gap-5">
      <ProfileFields value={draft} onChange={setDraft} error={update.error} prefix="profile." />
      <Switch label="Active" description="Inactive technicians can't sign in or receive jobs." checked={active} onCheckedChange={setActive} />
      <Button className="self-start" loading={update.isPending} onClick={() => update.mutate({ technicianId: technician.id, data: { profile: toProfileInput(draft), isActive: active } })}>
        Save profile
      </Button>
    </Card>
  );
}

function SkillsTab({ technician }: { technician: TechnicianResponse }) {
  const catalog = useGetActiveCatalog();
  const areas = useListServiceAreas();
  const [skills, setSkills] = useState<SkillInput[]>(technician.skills.map((s) => ({ categoryId: s.categoryId, level: s.level })));
  const [areaIds, setAreaIds] = useState<string[]>([...technician.serviceAreaIds]);
  const refresh = useRefresh(technician.id);
  const saveSkills = useSetTechnicianSkills({ mutation: { onSuccess: async (t) => { await refresh(t); toast.success('Skills saved'); } } });
  const saveAreas = useSetTechnicianServiceAreas({ mutation: { onSuccess: async (t) => { await refresh(t); toast.success('Areas saved'); } } });

  return (
    <Stack gap={6}>
      <Card className="flex flex-col gap-4">
        <Heading level={2} size="h3">
          Skills
        </Heading>
        <SkillsEditor categories={catalog.data ?? []} value={skills} onChange={setSkills} />
        <Button className="self-start" loading={saveSkills.isPending} disabled={skills.length === 0} onClick={() => saveSkills.mutate({ technicianId: technician.id, data: { skills } })}>
          Save skills
        </Button>
      </Card>
      <Card className="flex flex-col gap-4">
        <Heading level={2} size="h3">
          Areas covered
        </Heading>
        <AreasEditor areas={areas.data ?? []} value={areaIds} onChange={setAreaIds} />
        <Button className="self-start" loading={saveAreas.isPending} onClick={() => saveAreas.mutate({ technicianId: technician.id, data: { serviceAreaIds: areaIds } })}>
          Save areas
        </Button>
      </Card>
    </Stack>
  );
}

function ScheduleTab({ technician }: { technician: TechnicianResponse }) {
  const initial = Object.fromEntries(WEEK.map((day) => {
    const shift = technician.shifts.find((s) => s.day === day);
    return [day, { on: Boolean(shift), start: shift?.start.slice(0, 5) ?? '09:00', end: shift?.end.slice(0, 5) ?? '19:00' }];
  })) as Record<(typeof WEEK)[number], { on: boolean; start: string; end: string }>;
  const [week, setWeek] = useState(initial);
  const [leaveFrom, setLeaveFrom] = useState('');
  const [leaveTo, setLeaveTo] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const refresh = useRefresh(technician.id);
  const saveShifts = useSetTechnicianShifts({ mutation: { onSuccess: async (t) => { await refresh(t); toast.success('Shifts saved'); } } });
  const addLeave = useAddTechnicianTimeOff({ mutation: { onSuccess: async (t) => { await refresh(t); setLeaveFrom(''); setLeaveTo(''); setLeaveReason(''); toast.success('Time off added'); } } });
  const removeLeave = useRemoveTechnicianTimeOff({ mutation: { onSuccess: (t) => refresh(t) } });

  const shifts: ShiftInput[] = WEEK.filter((day) => week[day].on).map((day) => ({ day, start: `${week[day].start}:00`, end: `${week[day].end}:00` }));

  return (
    <Stack gap={6}>
      <Card className="flex flex-col gap-4">
        <Heading level={2} size="h3">
          Weekly shifts
        </Heading>
        <ul className="flex flex-col gap-3">
          {WEEK.map((day) => (
            <li key={day} className="grid items-center gap-3 sm:grid-cols-3">
              <Checkbox label={day.charAt(0) + day.slice(1).toLowerCase()} checked={week[day].on} onCheckedChange={(v) => setWeek({ ...week, [day]: { ...week[day], on: v === true } })} />
              <Input type="time" aria-label={`${day} start`} value={week[day].start} disabled={!week[day].on} onChange={(e) => setWeek({ ...week, [day]: { ...week[day], start: e.target.value } })} />
              <Input type="time" aria-label={`${day} end`} value={week[day].end} disabled={!week[day].on} onChange={(e) => setWeek({ ...week, [day]: { ...week[day], end: e.target.value } })} />
            </li>
          ))}
        </ul>
        <Button className="self-start" loading={saveShifts.isPending} onClick={() => saveShifts.mutate({ technicianId: technician.id, data: { shifts } })}>
          Save shifts
        </Button>
      </Card>

      <Card className="flex flex-col gap-4">
        <Heading level={2} size="h3">
          Time off
        </Heading>
        {technician.timeOff.length === 0 ? (
          <Text variant="sm" tone="muted">
            None planned.
          </Text>
        ) : (
          <ul className="flex flex-col gap-2">
            {technician.timeOff.map((leave) => (
              <li key={leave.id} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  {formatDateTime(leave.startsAt)} – {formatDateTime(leave.endsAt)}
                  {leave.reason ? <span className="text-foreground-muted"> · {leave.reason}</span> : null}
                </span>
                <IconButton icon={Trash2} label="Remove time off" size="sm" onClick={() => removeLeave.mutate({ technicianId: technician.id, timeOffId: leave.id })} />
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="From">
            <Input type="datetime-local" value={leaveFrom} onChange={(e) => setLeaveFrom(e.target.value)} />
          </Field>
          <Field label="Until">
            <Input type="datetime-local" value={leaveTo} onChange={(e) => setLeaveTo(e.target.value)} />
          </Field>
          <Field label="Reason" optional>
            <Input value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} />
          </Field>
        </div>
        <Button
          variant="outline"
          className="self-start"
          loading={addLeave.isPending}
          disabled={!leaveFrom || !leaveTo}
          onClick={() => {
            const startsAt = fromLocalInput(leaveFrom);
            const endsAt = fromLocalInput(leaveTo);
            if (startsAt && endsAt) {
              addLeave.mutate({ technicianId: technician.id, data: { startsAt, endsAt, reason: leaveReason || null } });
            }
          }}
        >
          Add time off
        </Button>
      </Card>
    </Stack>
  );
}
