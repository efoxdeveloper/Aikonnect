import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";
import { SidebarProvider as SidebarStateProvider, useSidebar } from "@/hooks/use-sidebar";

const SidebarProvider = SidebarStateProvider;
function Sidebar({ children, className, ...props }: React.HTMLAttributes<HTMLElement>) {
  const { state } = useSidebar();
  return <aside data-state={state} className={cn("fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-width)] flex-col border-r border-[#e7e9e8] bg-[#f6f7f6] transition-[width] duration-180 ease-out md:flex", state === "collapsed" && "w-[var(--sidebar-collapsed-width)]", className)} {...props}>{children}</aside>;
}
function SidebarHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("shrink-0", className)} {...props} />; }
function SidebarContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("scrollbar-subtle min-h-0 flex-1 overflow-y-auto", className)} {...props} />; }
function SidebarFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("shrink-0", className)} {...props} />; }
function SidebarGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("relative w-full min-w-0 px-3", className)} {...props} />; }
function SidebarGroupLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { const { state } = useSidebar(); return <div className={cn("mb-1 mt-4 px-2 text-[10px] font-bold uppercase leading-4 tracking-[0.07em] text-[var(--text-muted)] transition-[height,margin,opacity] duration-150", state === "collapsed" && "mb-2 mt-4 h-0 overflow-hidden px-0 opacity-0", className)} {...props} />; }
function SidebarMenu({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) { return <ul className={cn("flex w-full min-w-0 flex-col gap-px", className)} {...props} />; }
function SidebarMenuItem({ className, ...props }: React.HTMLAttributes<HTMLLIElement>) { return <li className={cn("group/menu-item relative min-w-0", className)} {...props} />; }
const SidebarMenuButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { isActive?: boolean; asChild?: boolean }>(({ className, isActive, asChild = false, ...props }, ref) => { const Comp = asChild ? Slot : "button"; return <Comp ref={ref} data-active={isActive || undefined} className={cn("interakt-nav-item group/menu-button relative -mx-1 flex h-10 w-[calc(100%+0.5rem)] min-w-0 touch-manipulation flex-row items-center gap-2.5 whitespace-nowrap rounded-md px-3 text-left text-[13px] font-medium leading-5 text-[var(--text-secondary)] outline-none transition-[background-color,color,box-shadow,transform] duration-150 ease-out hover:bg-[#e7e9e8] hover:text-[var(--text-primary)] active:scale-[.98] focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]/50 data-[active=true]:bg-[var(--brand-soft)] data-[active=true]:font-semibold data-[active=true]:text-[var(--brand)]", className)} {...props} />; });
SidebarMenuButton.displayName = "SidebarMenuButton";
function SidebarMenuSub({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) { return <ul className={cn("mx-3 flex min-w-0 translate-x-px flex-col border-l border-white/10 py-1.5 pl-3", className)} {...props} />; }
function SidebarMenuSubItem({ className, ...props }: React.HTMLAttributes<HTMLLIElement>) { return <li className={cn("relative min-w-0", className)} {...props} />; }
const SidebarMenuSubButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { isActive?: boolean; asChild?: boolean }>(({ className, isActive, asChild = false, ...props }, ref) => { const Comp = asChild ? Slot : "button"; return <Comp ref={ref} data-active={isActive || undefined} className={cn("interakt-nav-item relative flex min-h-9 w-full touch-manipulation items-center rounded-md px-2 text-left text-[13px] font-normal text-[var(--text-secondary)] outline-none transition-[background-color,color,box-shadow,transform] duration-150 ease-out hover:bg-[#f6f7f6] hover:text-[var(--text-primary)] active:scale-[.98] focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]/50 data-[active=true]:bg-[var(--brand-soft)] data-[active=true]:font-semibold data-[active=true]:text-[var(--brand)]", className)} {...props} />; });
SidebarMenuSubButton.displayName = "SidebarMenuSubButton";
export { Sidebar, SidebarProvider, SidebarHeader, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton };
