"use client";

import {useId, useState} from "react";
import {RefreshCw, Search} from "lucide-react";
import {ScheduleRecipient} from "@/lib/schedule-recipients";

export function ScheduleRecipientPicker({people, recipient, onChange, loading, error, onRefresh, mode}: {
  people: ScheduleRecipient[]; recipient: string; onChange: (email: string) => void;
  loading: boolean; error: string; onRefresh: () => void; mode: "AIR" | "SEA";
}) {
  const id = useId();
  const [search, setSearch] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const term = (search || "").trim().toLowerCase();
  const matching = people.filter(person => `${person.name} ${person.email}`.toLowerCase().includes(term));
  const matches = matching.slice(0, 30);
  const selected = people.find(person => person.email === recipient);
  const select = (person: ScheduleRecipient) => {
    if (!person.enabled) return;
    onChange(person.email); setSearch(null);
    document.getElementById(id)?.focus();
    setOpen(false);
  };
  return <div data-schedule-recipient-picker className="space-y-2">
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={id} className="text-xs font-semibold text-slate-700">Recipient</label>
      <button type="button" disabled={loading} onClick={onRefresh} className="flex items-center gap-1 text-[11px] text-blue-700 disabled:opacity-50">
        <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh users
      </button>
    </div>
    <div className="relative" onBlur={event => {if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);}}>
      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
      <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-results`}
        autoComplete="off" placeholder="Search Microsoft AD or saved users by name or email"
        value={search ?? recipient} onFocus={() => setOpen(true)}
        onChange={event => {setSearch(event.target.value); onChange(""); setOpen(true);}}
        onKeyDown={event => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "ArrowDown") {event.preventDefault(); setOpen(true); document.getElementById(`${id}-option-0`)?.focus();}
          if (event.key === "Enter") {
            event.preventDefault();
            if (matching.length === 1 && matching[0].enabled) select(matching[0]);
          }
        }} className="h-9 w-full rounded-lg border border-blue-100 bg-white pl-9 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200" />
      {open && <div id={`${id}-results`} role="listbox" aria-label="Matching schedule recipients"
        className="absolute z-30 top-full mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
        {matches.map((person, index) => <button key={person.email} id={`${id}-option-${index}`} type="button" role="option"
          aria-selected={person.email === recipient} aria-disabled={!person.enabled}
          onMouseDown={event => event.preventDefault()} onClick={() => select(person)}
          onKeyDown={event => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              document.getElementById(`${id}-option-${(index + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length}`)?.focus();
            }
            if (event.key === "Escape") {document.getElementById(id)?.focus(); setOpen(false);}
          }} className={`block w-full border-b border-slate-100 px-3 py-2 text-left last:border-b-0 focus:outline-none ${person.enabled ? 'hover:bg-blue-50 focus:bg-blue-50' : 'text-slate-400 cursor-not-allowed'}`}>
          <span className="block text-xs font-semibold whitespace-normal [overflow-wrap:anywhere]">{person.name}</span>
          <span className="block text-[11px] whitespace-normal [overflow-wrap:anywhere]">{person.email}</span>
          <span className="block text-[10px] text-slate-500">{person.enabled ? person.source : `${mode} reports disabled in saved preferences`}</span>
        </button>)}
        {matching.length > matches.length && <p className="px-3 py-2 text-[11px] text-slate-500">Type more to narrow {matching.length} matching users.</p>}
        {!matching.length && !loading && <p className="px-3 py-2 text-xs text-slate-500">No matching users. Try their email address or refresh users.</p>}
      </div>}
    </div>
    {loading && <p role="status" className="text-[11px] text-slate-500">Loading recipient directories…</p>}
    {error && <p role="alert" className="text-xs text-amber-700">{error}</p>}
    {selected?.enabled && <p className="text-xs text-slate-600">Selected: <strong>{selected.name}</strong> · {selected.email}</p>}
    {recipient && selected && !selected.enabled && <p className="text-xs text-amber-700">This recipient has {mode} reports turned off in the directory. Enable their freight preference to select them.</p>}
    {recipient && !selected && !loading && <p className="text-xs text-amber-700">This recipient is unavailable. Refresh users and select a recipient.</p>}
    <p className="text-[11px] text-slate-500">Only the selected person receives this schedule. Choose their report scope and timing below.</p>
  </div>;
}
