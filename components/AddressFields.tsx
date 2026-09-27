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

/** City name -> its ZIP codes, for one state. */
type CityZips = Record<string, string[]>;

// public/us-cities/<STATE>.json holds { city: [zips] } and is fetched once per state.
const cityCache = new Map<string, Promise<CityZips>>();
function loadCities(state: string) {
  if (!cityCache.has(state)) {
    cityCache.set(
      state,
      fetch(`/us-cities/${state}.json`)
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => {
          cityCache.delete(state); // allow a retry
          return {};
        }),
    );
  }
  return cityCache.get(state)!;
}

function useCities(state: string) {
  const [data, setData] = useState<{ state: string; zips: CityZips } | null>(null);
  useEffect(() => {
    if (!state) return;
    let live = true;
    loadCities(state).then((zips) => live && setData({ state, zips }));
    return () => {
      live = false;
    };
  }, [state]);
  const ready = !!state && data?.state === state;
  const zips = ready ? data.zips : null;
  const names = useMemo(() => (zips ? Object.keys(zips) : []), [zips]);
  return { names, zips: zips ?? {}, loading: !!state && !ready };
}

const MAX_OPTIONS = 100;

/** Items starting with the text first, then items containing it. */
function rank(list: string[], text: string, chosen: string) {
  const q = text.trim().toLowerCase();
  const matches =
    !q || q === chosen.toLowerCase()
      ? list.slice(0, MAX_OPTIONS)
      : [
          ...list.filter((c) => c.toLowerCase().startsWith(q)),
          ...list.filter((c) => !c.toLowerCase().startsWith(q) && c.toLowerCase().includes(q)),
        ].slice(0, MAX_OPTIONS);
  // Keep the chosen value in the collection so the field can display it.
  if (chosen && !matches.includes(chosen) && list.includes(chosen)) matches.unshift(chosen);
  return matches.map((name) => ({ name }));
}

// Make the dropdowns read as search boxes: magnifier, typing hint, no dropdown arrow.
const searchLook = {
  startContent: <SearchIcon className="size-4 shrink-0 text-steel" />,
  selectorButtonProps: { className: "hidden" },
  menuTrigger: "input" as const,
};

/** Pick-from-list city search. */
function CityAutocomplete({
  state,
  names,
  loading,
  value,
  onChange,
  disabled,
}: {
  state: string;
  names: string[];
  loading: boolean;
  value: string;
  onChange: (city: string) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]); // sample fill, swap
  const items = useMemo(() => rank(names, text, value), [names, text, value]);

  return (
    <Autocomplete
      {...searchLook}
      variant="bordered"
      size="sm"
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

/** ZIP field: a list of the chosen city's ZIPs when it has several; typing any ZIP still works. */
function ZipField({
  options,
  value,
  onChange,
  disabled,
}: {
  options: string[];
  value: string;
  onChange: (zip: string) => void;
  disabled?: boolean;
}) {
  const common = {
    variant: "bordered" as const,
    size: "sm" as const,
    label: "ZIP code",
    isRequired: true,
    isDisabled: disabled,
    inputMode: "numeric" as const,
    autoComplete: "postal-code",
    maxLength: 10,
  };
  const clean = (v: string) => v.replace(/[^\d-]/g, "");
  // Always filter by what's typed, so Enter picks the ZIP that matches rather than the first in the list.
  const items = useMemo(() => rank(options, value, ""), [options, value]);

  if (options.length < 2) {
    return <Input {...common} value={value} onValueChange={(v) => onChange(clean(v))} />;
  }
  return (
    <Autocomplete
      {...common}
      allowsCustomValue
      menuTrigger="focus"
      placeholder="Choose ZIP"
      items={items}
      inputValue={value}
      onInputChange={(v) => onChange(clean(v))}
      onSelectionChange={(key) => key && onChange(String(key))}
      listboxProps={{ emptyContent: "Not a ZIP for this city, but you can still use it." }}
    >
      {(z) => <AutocompleteItem key={z.name}>{z.name}</AutocompleteItem>}
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
  const { names, zips, loading } = useCities(value.state);
  const cityZips = (value.city && zips[value.city]) || [];

  function setState(code: string) {
    if (code === value.state) return;
    // City and ZIP only make sense within their state.
    onChange({ ...value, state: code, city: "", zip_code: "" });
  }

  function setCity(city: string) {
    const options = zips[city] ?? [];
    // One ZIP: fill it in. Several: keep the current ZIP if it belongs to the city, otherwise let the user pick.
    const zip = options.length === 1 ? options[0] : options.includes(value.zip_code) ? value.zip_code : "";
    onChange({ ...value, city, zip_code: zip });
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
          names={names}
          loading={loading}
          value={value.city}
          onChange={setCity}
          disabled={disabled}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ZipField
          key={value.city /* switch between plain input and ZIP list cleanly */}
          options={cityZips}
          value={value.zip_code}
          onChange={set("zip_code")}
          disabled={disabled}
        />
        <Input {...common} label="Phone" type="tel" isRequired autoComplete="tel" value={value.phone} onValueChange={set("phone")} />
      </div>
      <Input {...common} label="Email (optional)" type="email" autoComplete="email" value={value.email} onValueChange={set("email")} />
    </div>
  );
}
