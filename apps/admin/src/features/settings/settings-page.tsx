import { PageHeader, Stack, Tabs, TabsContent, TabsList, TabsTrigger } from '@servicepro/ui';

import { BusinessRulesTab } from './business-rules-tab';
import { CatalogTab } from './catalog-tab';
import { MessagesTab } from './messages-tab';
import { ServiceAreasTab } from './service-areas-tab';
import { TeamTab } from './team-tab';

/** Everything the owner configures (UX-ARCHITECTURE.md §3.3, conflict C9). */
export function SettingsPage() {
  return (
    <Stack gap={6}>
      <PageHeader title="Settings" />
      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Business rules</TabsTrigger>
          <TabsTrigger value="catalog">Services & prices</TabsTrigger>
          <TabsTrigger value="areas">Service areas</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
        </TabsList>
        <TabsContent value="rules">
          <BusinessRulesTab />
        </TabsContent>
        <TabsContent value="catalog">
          <CatalogTab />
        </TabsContent>
        <TabsContent value="areas">
          <ServiceAreasTab />
        </TabsContent>
        <TabsContent value="team">
          <TeamTab />
        </TabsContent>
        <TabsContent value="messages">
          <MessagesTab />
        </TabsContent>
      </Tabs>
    </Stack>
  );
}
