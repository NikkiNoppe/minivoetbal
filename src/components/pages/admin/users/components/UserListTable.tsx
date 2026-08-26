
import React, { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { User, Edit, Trash2, Loader2, ShieldCheck, Users2, UserCog } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import SearchInput from "@/components/ui/search-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppAlertModal, DestructiveConfirmDescription } from "@/components/modals";
import { DbUser } from "../userTypes";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PUBLIC_CARD_CLASS } from "@/components/layout";

interface UserListProps {
  users: DbUser[];
  loading: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  onEditUser?: (user: DbUser) => void;
  onDeleteUser?: (userId: number) => void;
  editMode?: boolean;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  roleFilter: string;
  onRoleFilterChange: (role: string) => void;
  teamFilter: string;
  onTeamFilterChange: (teamId: string) => void;
  teams: { team_id: number; team_name: string }[];
  addUserButton?: React.ReactNode;
}

const roleLabel = (role: string) => {
  if (role === "admin") return "Administrator";
  if (role === "player_manager") return "Teamverantwoordelijke";
  if (role === "referee") return "Scheidsrechter";
  return role;
};

const roleIcon = (role: string) => {
  if (role === "admin") return UserCog;
  if (role === "player_manager") return Users2;
  return ShieldCheck;
};

const roleBadgeVariant = (role: string): "default" | "secondary" | "outline" => {
  if (role === "admin") return "default";
  if (role === "player_manager") return "outline";
  return "secondary";
};

function MobileUserSkeleton() {
  return (
    <ul className="divide-y divide-border/60 md:hidden" aria-busy="true" aria-label="Gebruikers laden">
      {Array.from({ length: 5 }).map((_, index) => (
        <li key={`user-mobile-skeleton-${index}`} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-4 w-24 rounded-full" />
          </div>
          <div className="flex gap-1">
            <Skeleton className="h-10 w-10 rounded-md" />
            <Skeleton className="h-10 w-10 rounded-md" />
          </div>
        </li>
      ))}
    </ul>
  );
}

interface UserMobileCardProps {
  user: DbUser;
  editMode: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  onEdit?: (user: DbUser) => void;
  onDelete: (user: DbUser) => void;
}

function UserMobileCard({
  user,
  editMode,
  isUpdating,
  isDeleting,
  onEdit,
  onDelete,
}: UserMobileCardProps) {
  const Icon = roleIcon(user.role);
  const teams = user.teams ?? [];
  const teamSummary =
    teams.length === 0
      ? "Geen teams"
      : teams.length === 1
        ? teams[0].team_name
        : `${teams[0].team_name} +${teams.length - 1}`;

  return (
    <div className="flex items-start gap-2.5 px-3 py-3 min-h-[44px]">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary">
        <User className="h-3.5 w-3.5" aria-hidden />
      </span>

      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <p className="truncate text-sm font-semibold text-brand-dark">{user.username}</p>
          <Badge
            variant={roleBadgeVariant(user.role)}
            className="shrink-0 inline-flex items-center gap-1 border border-primary/20 px-1.5 py-0 text-[10px]"
          >
            <Icon className="h-3 w-3 shrink-0" aria-hidden />
            <span className="max-w-[7.5rem] truncate">{roleLabel(user.role)}</span>
          </Badge>
        </div>
        <p className="break-all text-xs text-muted-foreground">{user.email || "—"}</p>
        <p className="truncate text-xs text-muted-foreground/90" title={teams.map((t) => t.team_name).join(", ")}>
          {teamSummary}
        </p>
      </div>

      {editMode ? (
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="unstyled"
            className="btn btn--icon btn--edit min-h-[44px] min-w-[44px]"
            onClick={() => onEdit?.(user)}
            disabled={isUpdating || isDeleting}
            aria-label={`Bewerk ${user.username}`}
          >
            {isUpdating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Edit className="h-4 w-4" aria-hidden />
            )}
          </Button>
          <Button
            type="button"
            variant="unstyled"
            className="btn btn--icon btn--danger min-h-[44px] min-w-[44px]"
            onClick={() => onDelete(user)}
            disabled={isUpdating || isDeleting}
            aria-label={`Verwijder ${user.username}`}
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="h-4 w-4" aria-hidden />
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const UserListTable: React.FC<UserListProps> = ({
  users,
  loading,
  isUpdating,
  isDeleting,
  onEditUser,
  onDeleteUser,
  editMode = false,
  searchTerm,
  onSearchTermChange,
  roleFilter,
  onRoleFilterChange,
  addUserButton,
}) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<DbUser | null>(null);

  const handleDeleteClick = (user: DbUser) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (userToDelete && onDeleteUser) {
      onDeleteUser(userToDelete.user_id);
    }
    setDeleteDialogOpen(false);
    setUserToDelete(null);
  };

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false);
    setUserToDelete(null);
  };

  const isFiltered = searchTerm.trim().length > 0 || roleFilter !== "all";
  const emptyMessage = isFiltered
    ? "Geen gebruikers gevonden voor deze filters"
    : "Geen gebruikers gevonden";

  return (
    <div className="space-y-4 min-w-0">
      <div className="grid grid-cols-3 gap-2">
        <Card className={cn(PUBLIC_CARD_CLASS, "shadow-sm min-w-0")}>
          <CardContent className="p-2.5 sm:p-4">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
              Gebruikers
            </p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-brand-dark sm:mt-2 sm:text-2xl">
              {users.length}
            </p>
          </CardContent>
        </Card>
        <Card className={cn(PUBLIC_CARD_CLASS, "shadow-sm min-w-0")}>
          <CardContent className="p-2.5 sm:p-4">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
              Admins
            </p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-brand-dark sm:mt-2 sm:text-2xl">
              {users.filter((user) => user.role === "admin").length}
            </p>
          </CardContent>
        </Card>
        <Card className={cn(PUBLIC_CARD_CLASS, "shadow-sm min-w-0")}>
          <CardContent className="p-2.5 sm:p-4">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
              Teamrollen
            </p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-brand-dark sm:mt-2 sm:text-2xl">
              {users.filter((user) => user.role !== "admin").length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className={cn(PUBLIC_CARD_CLASS, "shadow-sm min-w-0")}>
        <CardContent className="space-y-3 p-3 sm:space-y-4 sm:p-5">
          <div className="flex flex-col gap-2 md:hidden">
            <SearchInput
              placeholder="Zoeken op naam..."
              value={searchTerm}
              onChange={onSearchTermChange}
              className="min-h-[44px] w-full"
            />
            <Select value={roleFilter} onValueChange={onRoleFilterChange}>
              <SelectTrigger className="w-full min-h-[44px]">
                <SelectValue placeholder="Alle rollen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle rollen</SelectItem>
                <SelectItem value="admin">Administrator</SelectItem>
                <SelectItem value="player_manager">Teamverantwoordelijke</SelectItem>
                <SelectItem value="referee">Scheidsrechter</SelectItem>
              </SelectContent>
            </Select>
            {addUserButton ? <div className="w-full">{addUserButton}</div> : null}
          </div>

          <div className="hidden md:flex md:flex-wrap md:items-end md:gap-4">
            <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
              <SearchInput
                placeholder="Zoeken op naam..."
                value={searchTerm}
                onChange={onSearchTermChange}
                className="min-h-[44px] w-full"
              />
              <Select value={roleFilter} onValueChange={onRoleFilterChange}>
                <SelectTrigger className="min-h-[44px] w-full">
                  <SelectValue placeholder="Alle rollen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle rollen</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                  <SelectItem value="player_manager">Teamverantwoordelijke</SelectItem>
                  <SelectItem value="referee">Scheidsrechter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {addUserButton ? <div className="shrink-0">{addUserButton}</div> : null}
          </div>
        </CardContent>
      </Card>

      <Card className={cn(PUBLIC_CARD_CLASS, "shadow-lg min-w-0")}>
        <CardContent className="min-w-0 p-0">
          {loading ? (
            <>
              <MobileUserSkeleton />
              <div className="hidden w-full min-w-0 md:block">
                <Table className="table w-full table-fixed">
                  <TableHeader>
                    <TableRow className="table-header-row">
                      <TableHead className="left w-[32%]">Naam</TableHead>
                      <TableHead className="left hidden w-[26%] lg:table-cell">Email</TableHead>
                      <TableHead className="left w-[18%]">Rol</TableHead>
                      <TableHead className="left w-[22%]">Teams</TableHead>
                      {editMode ? (
                        <TableHead className="right w-[100px]">Acties</TableHead>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: 5 }).map((_, index) => (
                      <TableRow key={`skeleton-${index}`}>
                        <TableCell className="left table-skeleton-cell">
                          <div className="flex items-center gap-3 min-w-0">
                            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <Skeleton className="h-4 w-28" />
                              <Skeleton className="h-3 w-36 lg:hidden" />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="left table-skeleton-cell hidden lg:table-cell">
                          <Skeleton className="h-4 w-40" />
                        </TableCell>
                        <TableCell className="left table-skeleton-cell">
                          <Skeleton className="h-6 w-28 rounded-full" />
                        </TableCell>
                        <TableCell className="left table-skeleton-cell">
                          <Skeleton className="h-6 w-24 rounded-full" />
                        </TableCell>
                        {editMode ? (
                          <TableCell className="right table-skeleton-cell">
                            <div className="flex justify-end gap-1.5">
                              <Skeleton className="h-11 w-11 rounded-md" />
                              <Skeleton className="h-11 w-11 rounded-md" />
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : !users || users.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <User className="mb-3 h-10 w-10 text-muted-foreground/50" aria-hidden />
              <p className="text-sm font-medium text-brand-dark">{emptyMessage}</p>
              {isFiltered ? (
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Pas je zoekterm of rolfilter aan.
                </p>
              ) : null}
            </div>
          ) : (
            <>
              <ul className="divide-y divide-border/60 md:hidden" aria-label="Gebruikerslijst">
                {users.map((user) => (
                  <li key={user.user_id}>
                    <UserMobileCard
                      user={user}
                      editMode={editMode}
                      isUpdating={isUpdating}
                      isDeleting={isDeleting}
                      onEdit={onEditUser}
                      onDelete={handleDeleteClick}
                    />
                  </li>
                ))}
              </ul>

              <div className="hidden w-full min-w-0 md:block">
                <Table className="table w-full table-fixed">
                  <TableHeader>
                    <TableRow className="table-header-row">
                      <TableHead className="left w-[32%]">Naam</TableHead>
                      <TableHead className="left hidden w-[26%] lg:table-cell">Email</TableHead>
                      <TableHead className="left w-[18%]">Rol</TableHead>
                      <TableHead className="left w-[22%]">Teams</TableHead>
                      {editMode ? (
                        <TableHead className="right w-[100px]">Acties</TableHead>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.user_id}>
                        <TableCell className="left font-medium">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary shadow-sm">
                              <User className="h-4 w-4" aria-hidden />
                            </span>
                            <div className="min-w-0 flex-1">
                              <span className="block truncate text-brand-dark">
                                {user.username}
                              </span>
                              <span
                                className="mt-0.5 block truncate text-xs text-muted-foreground lg:hidden"
                                title={user.email || undefined}
                              >
                                {user.email || "—"}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="left text-muted-foreground hidden lg:table-cell">
                          <div className="min-w-0 truncate" title={user.email || undefined}>
                            {user.email || "—"}
                          </div>
                        </TableCell>
                        <TableCell className="left">
                          <Badge
                            variant={roleBadgeVariant(user.role)}
                            className="inline-flex max-w-full items-center gap-1.5 border border-primary/20"
                          >
                            {React.createElement(roleIcon(user.role), {
                              className: "h-3.5 w-3.5 shrink-0",
                              "aria-hidden": true,
                            })}
                            <span className="truncate">{roleLabel(user.role)}</span>
                          </Badge>
                        </TableCell>
                        <TableCell className="left">
                          {user.teams && user.teams.length > 0 ? (
                            <div className="flex min-w-0 flex-wrap gap-1.5">
                              {user.teams.length <= 2 ? (
                                user.teams.map((team) => (
                                  <Badge
                                    key={team.team_id}
                                    variant="outline"
                                    className="max-w-full truncate border-primary/20 bg-brand-50"
                                    title={team.team_name}
                                  >
                                    {team.team_name}
                                  </Badge>
                                ))
                              ) : (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                        <Badge
                                          variant="outline"
                                          className="max-w-[9rem] truncate border-primary/20 bg-brand-50"
                                          title={user.teams[0].team_name}
                                        >
                                          {user.teams[0].team_name}
                                        </Badge>
                                        <Badge
                                          variant="secondary"
                                          className="shrink-0 border border-border/70"
                                        >
                                          +{user.teams.length - 1}
                                        </Badge>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <div className="space-y-1">
                                        {user.teams.map((team) => (
                                          <div key={team.team_id}>{team.team_name}</div>
                                        ))}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        {editMode ? (
                          <TableCell className="right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                type="button"
                                onClick={() => onEditUser?.(user)}
                                variant="unstyled"
                                className="btn btn--icon btn--edit min-h-[44px] min-w-[44px]"
                                disabled={isUpdating || isDeleting}
                                aria-label={`Bewerk ${user.username}`}
                              >
                                {isUpdating ? (
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                ) : (
                                  <Edit className="h-4 w-4" aria-hidden />
                                )}
                              </Button>
                              <Button
                                type="button"
                                onClick={() => handleDeleteClick(user)}
                                variant="unstyled"
                                className="btn btn--icon btn--danger min-h-[44px] min-w-[44px]"
                                disabled={isUpdating || isDeleting}
                                aria-label={`Verwijder ${user.username}`}
                              >
                                {isDeleting ? (
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                ) : (
                                  <Trash2 className="h-4 w-4" aria-hidden />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AppAlertModal
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Gebruiker verwijderen"
        size="sm"
        description={
          <DestructiveConfirmDescription
            message={
              <>
                Weet je zeker dat je{" "}
                <span className="font-semibold text-destructive">
                  {userToDelete?.username || userToDelete?.email}
                </span>{" "}
                wilt verwijderen?
              </>
            }
          />
        }
        confirmAction={{
          label: isDeleting ? "Verwijderen..." : "Verwijderen",
          onClick: handleConfirmDelete,
          variant: "destructive",
          disabled: isDeleting,
          loading: isDeleting,
        }}
        cancelAction={{
          label: "Annuleren",
          onClick: handleCancelDelete,
          variant: "secondary",
          disabled: isDeleting,
        }}
      />
    </div>
  );
};

export default UserListTable;
