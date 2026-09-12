import { BellIcon as Bell } from "@animateicons/react/lucide";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { UserMenu } from "./UserMenu";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { useAnimatedIcon } from "@/hooks/use-animated-icon";
import type { AnimatedIcon } from "@/config/navigation";
function HeaderIconButton({ label, icon: Icon, indicator }: { label: string; icon: AnimatedIcon; indicator?: boolean }) { const animatedIcon = useAnimatedIcon(); return <Tooltip><TooltipTrigger asChild><Button aria-label={label} title={label} variant="ghost" size="icon" onMouseEnter={animatedIcon.onMouseEnter} onMouseLeave={animatedIcon.onMouseLeave} className="group/action relative rounded-full bg-[#f7f8f7] text-[var(--icon-muted)] shadow-[inset_0_0_0_1px_#e9ecea] active:shadow-inner"><Icon ref={animatedIcon.ref} size={19} duration={0.7} />{indicator && <span className="pointer-events-none absolute right-1.5 top-1.5 size-[7px] rounded-full bg-[var(--brand-accent)] ring-2 ring-[#f7f8f7]" />}</Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>; }
export function HeaderActions() { return <TooltipProvider delayDuration={250}><div className="flex shrink-0 items-center gap-2 sm:gap-2.5"><WorkspaceSwitcher /><Popover><PopoverTrigger asChild><div><HeaderIconButton label="Notifications" icon={Bell} indicator /></div></PopoverTrigger><PopoverContent align="end" className="w-[250px]"><p >Notifications</p><p className="mt-1">You’re all caught up. New workspace activity will appear here.</p></PopoverContent></Popover><UserMenu /></div></TooltipProvider>; }
