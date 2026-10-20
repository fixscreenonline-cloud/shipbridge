"use client";

import { useRef, useState } from "react";
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Textarea,
  addToast,
} from "@heroui/react";
import type { Address } from "@/lib/types";

const MAX_SIDE = 1600; // enough for small print on labels; keeps uploads ~200-400 KB

/** Shrinks a photo in the browser and returns it as a JPEG data URL. */
async function shrinkPhoto(file: File): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This photo format isn't supported here. Try a JPEG or PNG, or take the photo again.");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

const CameraIcon = ({ className = "size-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);

/**
 * "Scan / paste" for an address card: take a photo of a label, envelope or card, pick a photo, or paste
 * text; the server reads it and the fields are filled for the user to check.
 */
export function AddressAssist({
  role,
  onFill,
  disabled,
}: {
  role: "sender" | "recipient";
  onFill: (address: Address) => void;
  disabled?: boolean;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  async function read(payload: { image?: string; text?: string }, source: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/scan-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, role }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Couldn't read that address.");
      onFill(json.address as Address);
      addToast({ title: `Filled from ${source}`, description: "Please check the details before getting rates.", color: "success" });
      return true;
    } catch (e) {
      addToast({ title: (e as Error).message, color: "danger" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (!file) return;
    try {
      setBusy(true);
      await read({ image: await shrinkPhoto(file) }, "photo");
    } catch (err) {
      addToast({ title: (err as Error).message, color: "danger" });
      setBusy(false);
    }
  }

  return (
    <>
      {/* capture="environment" opens the back camera on phones/iPads; desktops show a file picker */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />

      <Dropdown placement="bottom-end">
        <DropdownTrigger>
          <Button
            size="sm"
            variant="flat"
            color="primary"
            isLoading={busy}
            isDisabled={disabled}
            startContent={!busy && <CameraIcon />}
            className="font-medium"
          >
            {busy ? "Reading…" : "Scan / paste"}
          </Button>
        </DropdownTrigger>
        <DropdownMenu
          aria-label="Fill address"
          onAction={(key) => {
            if (key === "camera") cameraRef.current?.click();
            else if (key === "file") fileRef.current?.click();
            else if (key === "paste") setPasteOpen(true);
          }}
        >
          <DropdownItem key="camera" description="Label, envelope, card or note">
            Take a photo
          </DropdownItem>
          <DropdownItem key="file" description="From your photos or files">
            Choose a photo
          </DropdownItem>
          <DropdownItem key="paste" description="From an email, chat or document">
            Paste text
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>

      <Modal isOpen={pasteOpen} onOpenChange={setPasteOpen} placement="center">
        <ModalContent>
          {(close) => (
            <>
              <ModalHeader>Paste {role === "sender" ? "sender" : "recipient"} address</ModalHeader>
              <ModalBody>
                <Textarea
                  autoFocus
                  minRows={5}
                  maxLength={2000}
                  placeholder={"Jane Smith\n350 5th Ave, Suite 100\nNew York, NY 10118\n(212) 555-0199"}
                  value={pasteText}
                  onValueChange={setPasteText}
                />
                <p className="text-xs text-steel">Any layout works: one line or several, with or without labels.</p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={close}>
                  Cancel
                </Button>
                <Button
                  color="primary"
                  className="font-semibold"
                  isDisabled={!pasteText.trim()}
                  isLoading={busy}
                  onPress={async () => {
                    if (await read({ text: pasteText }, "pasted text")) {
                      setPasteText("");
                      close();
                    }
                  }}
                >
                  Fill address
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
