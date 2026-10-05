import { isApiError, useCreateTechnician, useGetActiveCatalog, useListServiceAreas, type SkillInput } from '@servicepro/api-client';
import { Alert, Button, Card, Heading, PageHeader, Stack, StickyActionBar, Text, toast } from '@servicepro/ui';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { paths } from '../../app/paths';
import { BackLink, formError } from '../../components/common';
import { AreasEditor, ProfileFields, SkillsEditor, emptyProfile, toProfileInput } from './technician-form';

/** Adding a technician also creates their login (phone + OTP) in the same transaction. */
export function NewTechnicianPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(emptyProfile);
  const [skills, setSkills] = useState<SkillInput[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const catalog = useGetActiveCatalog();
  const serviceAreas = useListServiceAreas();
  const create = useCreateTechnician({
    mutation: {
      meta: { silent: true },
      onSuccess: (technician) => {
        toast.success(`${technician.fullName} added`, { description: 'They can sign in to the technician app with their mobile number.' });
        void navigate(paths.technician(technician.id));
      },
    },
  });

  const topError = formError(create.error) ?? (isApiError(create.error) ? create.error.fieldError('skills') : undefined);

  return (
    <Stack gap={6}>
      <BackLink to={paths.technicians} label="Technicians" />
      <PageHeader title="Add technician" />
      {topError ? <Alert role="alert" tone="error" title={topError} /> : null}
      <Card className="flex flex-col gap-4">
        <Heading level={2} size="h3">
          Profile
        </Heading>
        <ProfileFields value={profile} onChange={setProfile} error={create.error} prefix="profile." />
      </Card>
      <Card className="flex flex-col gap-4">
        <Heading level={2} size="h3">
          Skills
        </Heading>
        <Text variant="sm" tone="secondary">
          Jobs are only suggested to technicians with the skill for that appliance.
        </Text>
        <SkillsEditor categories={catalog.data ?? []} value={skills} onChange={setSkills} />
      </Card>
      <Card className="flex flex-col gap-4">
        <Heading level={2} size="h3">
          Areas covered
        </Heading>
        <AreasEditor areas={serviceAreas.data ?? []} value={areas} onChange={setAreas} />
      </Card>
      <StickyActionBar className="md:justify-start">
        <Button
          size="lg"
          loading={create.isPending}
          disabled={!profile.fullName.trim() || !profile.phone.trim() || skills.length === 0}
          onClick={() => create.mutate({ data: { profile: toProfileInput(profile), skills, serviceAreaIds: areas } })}
        >
          Add technician
        </Button>
      </StickyActionBar>
    </Stack>
  );
}
