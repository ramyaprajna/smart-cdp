import { memo } from "react";
import { Link } from "wouter";
import { LogOut, HelpCircle, BookOpen } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useSidebarNavigation } from "@/hooks/use-sidebar-navigation";

const Sidebar = memo(function Sidebar() {
  const {
    location,
    currentUser,
    groupedNavItems,
    isActiveLink,
    getTourDataAttribute,
    getUserInitials,
    getUserDisplayName,
    getUserRole,
    handleLogout,
    startTour,
    brandName,
    brandIcon: BrandIcon
  } = useSidebarNavigation();

  return (
    <div className="w-64 bg-sidebar-background shadow-lg border-r border-sidebar-border flex flex-col">
      <div className="p-6 border-b border-sidebar-border sidebar-header">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-sidebar-primary rounded-lg flex items-center justify-center">
            <BrandIcon className="w-4 h-4 text-sidebar-primary-foreground" />
          </div>
          <h1 className="text-xl font-semibold text-sidebar-foreground">{brandName}</h1>
        </div>
      </div>

      <TooltipProvider>
        <nav className="flex-1 p-4 space-y-4 overflow-y-auto">
          {groupedNavItems.map((group) => (
            <div key={group.name}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-1">
                {group.name}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = isActiveLink(item.href);
                  const Icon = item.icon;

                  return (
                    <Tooltip key={item.name}>
                      <TooltipTrigger asChild>
                        <Link href={item.href}>
                          <div
                            className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                            data-tour={getTourDataAttribute(item.href)}
                          >
                            <Icon className="w-5 h-5" />
                            <span>{item.name}</span>
                          </div>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <p>{item.tooltip}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="pt-2 border-t border-sidebar-border">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href="/help">
                  <div className={`sidebar-nav-item ${isActiveLink('/help') ? 'active' : ''}`}>
                    <BookOpen className="w-5 h-5" />
                    <span>Help & API Docs</span>
                  </div>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p>API reference, webhook setup guides, and third-party integration examples</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </nav>
      </TooltipProvider>

      <div className="p-4 border-t border-sidebar-border space-y-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={startTour}
              className="w-full justify-start text-sm"
            >
              <HelpCircle className="h-4 w-4 mr-2" />
              Start Tour
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Take an interactive tour of Smart CDP Platform features</p>
          </TooltipContent>
        </Tooltip>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-muted-foreground">
                {getUserInitials()}
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-sidebar-foreground">
                {getUserDisplayName()}
              </p>
              <p className="text-xs text-muted-foreground">
                {getUserRole()}
              </p>
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>Sign out</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
});

export default Sidebar;
