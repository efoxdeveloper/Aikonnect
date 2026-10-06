import { BellIcon as Bell } from "@animateicons/react/lucide";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserMenu } from "./UserMenu";

export function SidebarFooter({ expanded, showProfile }: { expanded: boolean; showProfile: boolean }) {
  return (
    <div data-testid="sidebar-account-footer" className={`mt-auto flex w-full shrink-0 flex-col gap-1 border-t border-[var(--border)] pt-2 ${expanded ? "items-stretch" : "items-center"}`}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            aria-label="Notifications"
            title="Notifications"
            data-testid="sidebar-notifications"
            className={`h-10 rounded-lg text-[var(--text-secondary)] hover:bg-white hover:text-[var(--text-primary)] ${expanded ? "w-full justify-start gap-3 px-3" : "w-10 justify-center px-0"}`}
          >
            <Bell size={18} aria-hidden="true" />
            {expanded && <span className="text-[13px] font-medium">Notifications</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent side="right" align="end" className="w-[250px]">
          <p>Notifications</p>
          <p className="mt-1">You’re all caught up. New workspace activity will appear here.</p>
        </PopoverContent>
      </Popover>
      {showProfile && <UserMenu expanded={expanded} />}
    </div>
  );
}
