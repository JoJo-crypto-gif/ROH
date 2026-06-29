import { Bell, Search, ChevronDown, LogOut, Building2, Sun, Moon, Settings } from "lucide-react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function Topbar() {
  const { user, signOut } = useAuth();
  const { mode, setMode, brandName, logo } = useTheme();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:px-6">
      <div className="relative flex-1 max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          placeholder="Search students, staff, receipts…"
          className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-12 text-sm outline-none ring-0 placeholder:text-muted-foreground focus:border-ring"
        />
        <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          ⌘K
        </kbd>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 hidden sm:inline-flex">
            {logo ? (
              <img src={logo} alt="" className="h-4 w-4 rounded object-cover" />
            ) : (
              <Building2 className="h-4 w-4" />
            )}
            {brandName}
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Switch organization</DropdownMenuLabel>
          <DropdownMenuItem>{brandName}</DropdownMenuItem>
          <DropdownMenuItem disabled>{brandName} NGO · soon</DropdownMenuItem>
          <DropdownMenuItem disabled>Group Holdings · soon</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle theme"
        onClick={() => setMode(mode === "dark" ? "light" : "dark")}
      >
        {mode === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </Button>

      <Button variant="ghost" size="icon" aria-label="Settings" asChild>
        <Link to="/settings">
          <Settings className="h-5 w-5" />
        </Link>
      </Button>

      <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
        <Bell className="h-5 w-5" />
        <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand-accent" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2.5 rounded-lg border border-border bg-card pl-1.5 pr-3 py-1.5 hover:bg-muted/60 transition">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-brand-foreground text-xs font-semibold">
              {user?.avatarInitials}
            </span>
            <div className="hidden text-left sm:block">
              <div className="text-xs font-medium leading-tight">{user?.name}</div>
              <div className="text-[10px] text-muted-foreground">{user?.roleName}</div>
            </div>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="flex flex-col">
            <span>{user?.name}</span>
            <span className="text-xs font-normal text-muted-foreground">{user?.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/settings">
              <Settings className="mr-2 h-4 w-4" /> Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={async () => {
              await signOut();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
