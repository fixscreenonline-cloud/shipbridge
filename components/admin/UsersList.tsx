"use client";

import { useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  addToast,
} from "@heroui/react";
import { PlusIcon } from "../icons";
import { formatMoney } from "@/lib/pricing";
import type { CustomerView } from "@/lib/types";

export type CustomerRow = CustomerView & { usage: { labels: number; spend: number; fees: number } };

// No look-alike characters (0/O, 1/l/I), so a password read out or typed from a message is unambiguous.
const PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
function randomPassword(length = 12) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join("");
}

type Created = { id: string; username: string; password: string; label: string };

function NewCustomerModal({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const blank = () => ({ password: randomPassword(), name: "", company: "", email: "" });
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  async function create() {
    setBusy(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return addToast({ title: json.error ?? "Couldn't create the customer.", color: "danger" });
    setCreated({ id: json.user.id, username: json.user.username, password: f.password, label: f.company || f.name || json.user.username });
    router.refresh();
  }

  const details = created
    ? `ShipBridge sign-in\n${window.location.origin}/\nUsername: ${created.username}\nPassword: ${created.password}\nPlease change the password in Settings after signing in.`
    : "";

  function finish(close: () => void, open: boolean) {
    const id = created?.id;
    close();
    setCreated(null);
    setF(blank());
    if (open && id) router.push(`/admin/users/${id}`);
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} placement="center" isDismissable={!created}>
      <ModalContent>
        {(close) =>
          created ? (
            <>
              <ModalHeader>{created.label} is ready</ModalHeader>
              <ModalBody className="gap-3">
                <p className="text-sm text-steel">Send these to the customer. The password is shown only now.</p>
                <dl className="divide-y divide-ink/10 rounded-lg border border-ink/10 bg-background text-sm">
                  <div className="flex justify-between gap-4 px-4 py-2.5">
                    <dt className="text-steel">Username</dt>
                    <dd className="font-mono font-semibold">{created.username}</dd>
                  </div>
                  <div className="flex justify-between gap-4 px-4 py-2.5">
                    <dt className="text-steel">Password</dt>
                    <dd className="font-mono font-semibold">{created.password}</dd>
                  </div>
                </dl>
                <Button
                  variant="bordered"
                  onPress={() =>
                    navigator.clipboard
                      ?.writeText(details)
                      .then(() => addToast({ title: "Sign-in details copied", color: "success" }))
                      .catch(() => addToast({ title: "Couldn't copy. Select the text instead.", color: "warning" }))
                  }
                >
                  Copy sign-in details
                </Button>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={() => finish(close, false)}>
                  Done
                </Button>
                <Button color="primary" className="font-semibold" onPress={() => finish(close, true)}>
                  Set fee and features
                </Button>
              </ModalFooter>
            </>
          ) : (
            <>
              <ModalHeader>New customer</ModalHeader>
              <ModalBody className="gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Business name" variant="bordered" size="sm" value={f.company} onValueChange={set("company")} />
                  <Input label="Contact name" variant="bordered" size="sm" value={f.name} onValueChange={set("name")} />
                </div>
                <Input label="Email (optional)" type="email" variant="bordered" size="sm" value={f.email} onValueChange={set("email")} />
                <Input
                  label="Temporary password"
                  isRequired
                  type="text"
                  variant="bordered"
                  size="sm"
                  autoComplete="off"
                  description="8+ characters. They can change it in Settings."
                  value={f.password}
                  onValueChange={set("password")}
                  endContent={
                    <button type="button" className="shrink-0 text-xs font-medium text-steel hover:text-foreground" onClick={() => set("password")(randomPassword())}>
                      New
                    </button>
                  }
                />
                <p className="text-xs text-steel">
                  Their username is given automatically: <span className="font-mono">booking</span> + the next number (like{" "}
                  <span className="font-mono">booking3</span>). It&apos;s permanent. You&apos;ll see it next, ready to copy.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={close}>
                  Cancel
                </Button>
                <Button color="primary" className="font-semibold" isLoading={busy} isDisabled={f.password.length < 8} onPress={create}>
                  Create customer
                </Button>
              </ModalFooter>
            </>
          )
        }
      </ModalContent>
    </Modal>
  );
}

export function UsersList({ users }: { users: CustomerRow[] }) {
  const [open, setOpen] = useState(false);
  const totals = users.reduce((t, u) => ({ labels: t.labels + u.usage.labels, fees: t.fees + u.usage.fees }), { labels: 0, fees: 0 });

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="rounded-lg bg-content1 px-3 py-2 shadow-sm ring-1 ring-ink/10">
            <strong>{users.filter((u) => u.active).length}</strong> active of {users.length}
          </span>
          <span className="rounded-lg bg-content1 px-3 py-2 shadow-sm ring-1 ring-ink/10">
            This month: <strong>{totals.labels}</strong> {totals.labels === 1 ? "label" : "labels"} · your fees <strong className="text-success">{formatMoney(totals.fees)}</strong>
          </span>
        </div>
        <Button color="secondary" className="font-semibold" startContent={<PlusIcon />} onPress={() => setOpen(true)}>
          New customer
        </Button>
      </div>

      {users.length === 0 ? (
        <div className="rounded-xl border border-ink/10 bg-content1 p-10 text-center shadow-sm">
          <p className="display text-lg font-semibold">No customers yet</p>
          <p className="mt-1 text-sm text-steel">Create a login for each business you serve. They use their own Shippo account.</p>
          <Button color="primary" className="mt-5 font-semibold" onPress={() => setOpen(true)}>
            Create the first customer
          </Button>
        </div>
      ) : (
        <ul className="grid gap-3">
          {users.map((u) => (
            <li key={u.id}>
              <NextLink
                href={`/admin/users/${u.id}`}
                className="flex flex-wrap items-center gap-4 rounded-xl border border-ink/10 bg-content1 p-4 shadow-sm transition-colors hover:border-ink/30"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-hivis">
                  {(u.company || u.name || u.username).charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{u.company || u.name || u.username}</span>
                    <Chip size="sm" variant="flat" color={u.active ? "success" : "default"} className="h-5">
                      {u.active ? "Active" : "Off"}
                    </Chip>
                    <Chip size="sm" variant="flat" color={u.shippo.connected ? "primary" : "warning"} className="h-5">
                      {u.shippo.connected ? `Shippo ${u.shippo.mode} ····${u.shippo.last4}` : "No Shippo key"}
                    </Chip>
                  </span>
                  <span className="mt-0.5 block text-xs text-steel">
                    @{u.username}
                    {u.name && u.company ? ` · ${u.name}` : ""} · fee {u.settings.feePercent}%
                    {u.settings.feeFlat ? ` + ${formatMoney(u.settings.feeFlat)}` : ""}
                  </span>
                </span>
                <span className="text-right text-sm">
                  <span className="block font-semibold tabular-nums">{u.usage.labels} {u.usage.labels === 1 ? "label" : "labels"}</span>
                  <span className="block text-xs text-steel tabular-nums">
                    spend {formatMoney(u.usage.spend)} · fees <span className="text-success">{formatMoney(u.usage.fees)}</span>
                  </span>
                </span>
              </NextLink>
            </li>
          ))}
        </ul>
      )}

      <NewCustomerModal isOpen={open} onOpenChange={setOpen} />
    </>
  );
}
