"use client";

import { useRouter } from "next/navigation";
import { Avatar, Dropdown, DropdownItem, DropdownMenu, DropdownSection, DropdownTrigger } from "@heroui/react";
import { GearIcon, GridIcon, LogoutIcon, PlusIcon, ReceiptIcon } from "./icons";

/** Header profile button: avatar + name; the menu shows the role and the account actions. */
export function ProfileMenu({ username, isAdmin }: { username: string; isAdmin: boolean }) {
  const router = useRouter();

  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  return (
    <Dropdown placement="bottom-end">
      <DropdownTrigger>
        <button
          type="button"
          aria-label={`Account menu for ${username}`}
          className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-hivis"
        >
          <Avatar
            name={username}
            getInitials={(n) => n.trim().charAt(0).toUpperCase()}
            size="sm"
            classNames={{ base: "bg-hivis text-ink", name: "font-bold text-sm" }}
          />
          <span className="hidden max-w-[10rem] truncate text-sm font-medium text-white sm:block">{username}</span>
        </button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="Account"
        onAction={(key) => {
          if (key === "signout") signOut();
          else if (key === "admin") router.push("/admin");
          else if (key === "ship") router.push("/");
          else if (key === "orders") router.push("/orders");
          else if (key === "settings") router.push("/settings");
        }}
      >
        <DropdownSection showDivider aria-label="Profile">
          <DropdownItem key="profile" isReadOnly className="cursor-default opacity-100" textValue={username}>
            <p className="font-semibold">{username}</p>
            <p className="text-xs text-steel">{isAdmin ? "Admin" : "Customer"}</p>
          </DropdownItem>
        </DropdownSection>
        {isAdmin ? (
          <DropdownSection showDivider aria-label="Go to">
            <DropdownItem key="admin" startContent={<GridIcon />}>
              Admin dashboard
            </DropdownItem>
          </DropdownSection>
        ) : (
          <DropdownSection showDivider aria-label="Go to">
            <DropdownItem key="ship" startContent={<PlusIcon />}>
              New shipment
            </DropdownItem>
            <DropdownItem key="orders" startContent={<ReceiptIcon />}>
              My orders
            </DropdownItem>
            <DropdownItem key="settings" startContent={<GearIcon />}>
              Settings
            </DropdownItem>
          </DropdownSection>
        )}
        <DropdownSection aria-label="Session">
          <DropdownItem key="signout" color="danger" className="text-danger" startContent={<LogoutIcon />}>
            Sign out
          </DropdownItem>
        </DropdownSection>
      </DropdownMenu>
    </Dropdown>
  );
}
