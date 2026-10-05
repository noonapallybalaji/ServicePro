import { DefaultSkeleton, QueryState } from '@servicepro/app-kit';
import { getListStaffUsersQueryKey, useCreateStaffUser, useListStaffUsers, type UserRole } from '@servicepro/api-client';
import { Badge, Button, Card, Field, Heading, Input, Select, Stack, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow, formatRelative, toast } from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { fieldError, formError, humanize } from '../../components/common';

/** Office accounts (owner, admins, dispatchers). Technicians are managed under Technicians. */
export function TeamTab() {
  const users = useListStaffUsers();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('DISPATCHER');
  const [password, setPassword] = useState('');
  const create = useCreateStaffUser({
    mutation: {
      meta: { silent: true },
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListStaffUsersQueryKey() });
        setName('');
        setEmail('');
        setPhone('');
        setPassword('');
        toast.success('User added');
      },
    },
  });

  return (
    <Stack gap={6}>
      <QueryState query={users} loading={<DefaultSkeleton rows={2} />}>
        {(list) => (
          <Card padding="none">
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Email</TableHeaderCell>
                  <TableHeaderCell>Role</TableHeaderCell>
                  <TableHeaderCell>Last sign-in</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {list.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-semibold">
                      {user.fullName} {user.isActive ? null : <Badge size="sm">Inactive</Badge>}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{humanize(user.role)}</TableCell>
                    <TableCell className="text-foreground-secondary">{user.lastLoginAt ? formatRelative(user.lastLoginAt) : 'Never'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </QueryState>

      <Card className="flex flex-col gap-4">
        <Heading level={3}>Add an office user</Heading>
        {formError(create.error) ? <p role="alert" className="text-sm text-error">{formError(create.error)}</p> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" error={fieldError(create.error, 'fullName')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Email" error={fieldError(create.error, 'email')}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Mobile" error={fieldError(create.error, 'phone')}>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="DISPATCHER">Dispatcher — runs jobs</option>
              <option value="ADMIN">Admin — also settings & team</option>
              <option value="OWNER">Owner</option>
            </Select>
          </Field>
          <Field label="Temporary password" hint="At least 10 characters with a letter and a number." error={fieldError(create.error, 'password')}>
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
        <Button className="self-start" loading={create.isPending} onClick={() => create.mutate({ data: { fullName: name, phone, email, role, password } })}>
          Add user
        </Button>
      </Card>
    </Stack>
  );
}
