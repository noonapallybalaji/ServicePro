import { session } from '@servicepro/api-client';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, getInitials } from '@servicepro/ui';
import { CalendarCheck, LogOut, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router';

/** The signed-in customer's menu: who you are, Profile, My bookings, Sign out. */
export function SignedInMenu({ fullName, phone }: { fullName: string; phone: string }) {
  const navigate = useNavigate();

  return (
    <Menu>
      <MenuTrigger
        aria-label={`Account menu for ${fullName}`}
        className="pressable transition-interactive flex size-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground hover:bg-primary-hover"
      >
        {getInitials(fullName) || <UserRound aria-hidden className="size-5" />}
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>
          <span className="truncate text-sm font-bold text-foreground">{fullName}</span>
          <span className="text-caption text-foreground-muted tabular-nums">{phone}</span>
        </MenuLabel>
        <MenuSeparator />
        <MenuItem onSelect={() => void navigate('/account?tab=profile')}>
          <UserRound aria-hidden /> Profile
        </MenuItem>
        <MenuItem onSelect={() => void navigate('/account')}>
          <CalendarCheck aria-hidden /> My bookings
        </MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={() => void session.signOut()}>
          <LogOut aria-hidden /> Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
