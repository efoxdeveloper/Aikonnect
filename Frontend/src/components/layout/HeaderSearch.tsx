import { useMemo, useState, type KeyboardEvent } from "react";
import { SearchIcon as Search } from "@animateicons/react/lucide";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { navigationGroups, type NavigationItem } from "@/config/navigation";
import { useAnimatedIcon } from "@/hooks/use-animated-icon";

type SearchResult = { item: NavigationItem; groupTitle?: string };

const searchResults: SearchResult[] = navigationGroups.flatMap((group) => group.items.flatMap((item) => [
  { item, groupTitle: group.title },
  ...(item.children ?? []).map((child) => ({ item: child, groupTitle: group.title })),
])).filter(({ item }) => Boolean(item.url));

export function HeaderSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const searchIcon = useAnimatedIcon();
  const normalizedQuery = query.trim().toLowerCase();
  const filteredResults = useMemo(() => searchResults.filter(({ item, groupTitle }) => {
    if (!normalizedQuery) return true;
    return `${item.title} ${groupTitle ?? ""} ${(item.keywords ?? []).join(" ")}`.toLowerCase().includes(normalizedQuery);
  }), [normalizedQuery]);

  const selectResult = (url?: string) => {
    if (!url) return;
    navigate(url);
    setOpen(false);
    setQuery("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      selectResult(filteredResults[0]?.item.url);
    }
    if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverAnchor asChild>
      <div onMouseEnter={searchIcon.onMouseEnter} onMouseLeave={searchIcon.onMouseLeave} className="group/search flex h-9 w-full max-w-[420px] min-w-0 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-3 transition-[border-color,box-shadow] focus-within:border-[var(--brand-accent)] focus-within:ring-2 focus-within:ring-[var(--brand-accent)]/10">
        <Search ref={searchIcon.ref} size={18} duration={0.7} className="shrink-0 text-[var(--icon-muted)] transition-colors duration-150 group-focus-within/search:text-[var(--brand)]" />
        <Input
          aria-label="Search"
          aria-expanded={open}
          placeholder="Search tools and settings..."
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="h-9 border-0 bg-transparent px-0 text-[14px] font-normal shadow-none focus-visible:ring-0"
        />
      </div>
    </PopoverAnchor>
    <PopoverContent align="start" className="w-[320px] p-0">
      <Command shouldFilter={false}>
        <CommandList>
          <CommandEmpty>No pages found.</CommandEmpty>
          <CommandGroup heading="Navigate to">
            {filteredResults.map(({ item, groupTitle }) => <CommandItem key={item.url} value={item.title} onSelect={() => selectResult(item.url)}>
              <item.icon size={17} duration={0.7} color={item.iconColor} className={item.iconColor ? "shrink-0" : "shrink-0 text-[var(--text-muted)]"} />
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
              {groupTitle && <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{groupTitle}</span>}
            </CommandItem>)}
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}
