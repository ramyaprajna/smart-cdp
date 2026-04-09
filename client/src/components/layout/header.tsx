import { memo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus } from "lucide-react";

interface HeaderProps {
  title: string;
  subtitle?: string;
  onSearch?: (query: string) => void;
  onAction?: () => void;
  actionLabel?: string;
  searchPlaceholder?: string;
}

const Header = memo<HeaderProps>(function Header({
  title,
  subtitle,
  onSearch,
  onAction,
  actionLabel = "Add New",
  searchPlaceholder = "Search..."
}) {
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onSearch?.(e.target.value);
  }, [onSearch]);
  return (
    <header className="bg-card border-b border-border px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
          {subtitle && <p className="text-muted-foreground text-sm">{subtitle}</p>}
        </div>
        <div className="flex items-center space-x-4">
          {onSearch && (
            <div className="relative">
              <Input
                type="text"
                placeholder={searchPlaceholder}
                className="w-80 pl-10"
                onChange={handleSearchChange}
              />
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            </div>
          )}
          {onAction && (
            <Button onClick={onAction} className="flex items-center space-x-2">
              <Plus className="w-4 h-4" />
              <span>{actionLabel}</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
});

export default Header;
