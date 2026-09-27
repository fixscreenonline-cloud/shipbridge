"use client";

import { useEffect, useMemo, useState } from "react";
import { Autocomplete, AutocompleteItem, Input } from "@heroui/react";
import { US_STATES } from "@/lib/us-states";
import type { Address } from "@/lib/types";
import { SearchIcon } from "./icons";

export const emptyAddress = (): Address => ({
  first_name: "",
  last_name: "",
  company_name: "",
  phone: "",
  email: "",
  street: "",
  street2: "",
  city: "",
  state: "",
  zip_code: "",
  country: "US",
});

// City lists live in public/us-cities/<STATE>.json and are fetched once per state.
const cityCache = new Map<string, Promise<string[]>>();
function loadCities(state: string) {
  if (!cityCache.has(state)) {
    cityCache.set(
      state,
      fetch(`/us-cities/${state}.json`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => {
          cityCache.delete(state); // allow a retry
          return [];
        }),
    );
  }
  return cityCache.get(state)!;
}

function useCities(state: string) {
  const [cities, setCities] = useState<{ state: string; list: string[] } | null>(null);
  useEffect(() => {
    if (!state) return;
    let live = true;
    loadCities(state).then((list) => live && setCities({ state, list }));
    return () => {
      live = false;
    };
  }, [state]);
  const ready = !!state && cities?.state === state;
  return { cities: ready ? cities.list : [], loading: !!state && !ready };
}

const MAX_CITY_OPTIONS = 100;

// Make the dropdowns read as search boxes: magnifier, typing hint, no dropdown arrow.
const searchLook = {
  startContent: <SearchIcon className="size-4 shrink-0 text-steel" />,
  selectorButtonProps: { className: "hidden" },
  menuTrigger: "input" as const,
};

/** Pick-from-list city search: names starting with the text first, then names containing it. */
function CityAutocomplete({
  state,
  value,
  onChange,
  disabled,
}: {
  state: string;
  value: string;
  onChange: (city: string) => void;
  disabled?: boolean;
}) {
  const { cities, loading } = useCities(state);
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]); // sample fill, swap

  const items = useMemo(() => {
    const q = text.trim().toLowerCase();
    const matches =
      !q || q === value.toLowerCase()
        ? cities.slice(0, MAX_CITY_OPTIONS)
        : [
            ...cities.filter((c) => c.toLowerCase().startsWith(q)),
            ...cities.filter((c) => !c.toLowerCase().startsWith(q) && c.toLowerCase().includes(q)),
          ].slice(0, MAX_CITY_OPTIONS);
    // Keep the chosen city in the collection so the field can display it.
    if (value && !matches.includes(value) && cities.includes(value)) matches.unshift(value);
    return matches.map((name) => ({ name }));
  }, [cities, text, value]);

  return (
    <Autocomplete
      variant="bordered"
      size="sm"
      {...searchLook}
      label="City"
      isRequired
      isDisabled={disabled || !state}
      isLoading={loading}
      placeholder={state ? "Type a city to search" : "Choose a state first"}
      items={items}
      inputValue={text}
      onInputChange={setText}
      onBlur={() => setText(value) /* typed text that isn't a listed city doesn't stick */}
      selectedKey={value || null}
      onSelectionChange={(key) => onChange(key ? String(key) : "")}
      listboxProps={{ emptyContent: loading ? "Loading cities…" : "No city in this state matches." }}
    >
      {(c) => <AutocompleteItem key={c.name}>{c.name}</AutocompleteItem>}
    </Autocomplete>
  );
}

const stateItems = US_STATES.map((s) => ({ ...s, label: `${s.code} – ${s.name}` }));

type Props = {
  value: Address;
  onChange: (next: Address) => void;
  disabled?: boolean;
};

// Layout follows the fieldset's own width (container queries), not the screen, because the same
// fields can be ~260px wide (iPad landscape, next to the rates panel) or ~550px wide.
export function AddressFields({ value, onChange, disabled }: Props) {
  const set = (key: keyof Address) => (v: string) => onChange({ ...value, [key]: v });
  const common = { variant: "bordered" as const, size: "sm" as const, isDisabled: disabled };
  function setState(code: string) {
    if (code === value.state) return;
    // A city only makes sense within its state.
    onChange({ ...value, state: code, city: "" });
  }

  return (
    <div className="@container space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Input {...common} label="First name" isRequired autoComplete="given-name" value={value.first_name} onValueChange={set("first_name")} />
        <Input {...common} label="Last name" isRequired autoComplete="family-name" value={value.last_name} onValueChange={set("last_name")} />
      </div>
      <Input {...common} label="Company (optional)" autoComplete="organization" value={value.company_name} onValueChange={set("company_name")} />
      <Input {...common} label="Street address" isRequired autoComplete="address-line1" value={value.street} onValueChange={set("street")} />
      <Input {...common} label="Apt, suite, unit (optional)" autoComplete="address-line2" value={value.street2} onValueChange={set("street2")} />

      <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
        <Autocomplete
          {...common}
          {...searchLook}
          label="State"
          isRequired
          placeholder="Type a state or code, e.g. TX"
          defaultItems={stateItems}
          selectedKey={value.state || null}
          onSelectionChange={(key) => setState(key ? String(key) : "")}
          listboxProps={{ emptyContent: "No US state matches." }}
        >
          {(s) => (
            <AutocompleteItem key={s.code} textValue={s.label}>
              <span className="inline-block w-8 font-semibold tabular-nums">{s.code}</span>
              {s.name}
            </AutocompleteItem>
          )}
        </Autocomplete>

        <CityAutocomplete
          key={value.state /* fresh search text when the state changes */}
          state={value.state}
          value={value.city}
          onChange={set("city")}
          disabled={disabled}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          {...common}
          label="ZIP code"
          isRequired
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={10}
          value={value.zip_code}
          onValueChange={(v) => set("zip_code")(v.replace(/[^\d-]/g, ""))}
        />
        <Input {...common} label="Phone" type="tel" isRequired autoComplete="tel" value={value.phone} onValueChange={set("phone")} />
      </div>
      <Input {...common} label="Email (optional)" type="email" autoComplete="email" value={value.email} onValueChange={set("email")} />
    </div>
  );
}
