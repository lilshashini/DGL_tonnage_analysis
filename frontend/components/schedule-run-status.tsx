"use client";

import {useEffect, useId, useRef} from "react";
import {AlertCircle, CheckCircle, Info, Mail, RefreshCw} from "lucide-react";

export type ScheduleRunState = {
  scheduleId: string;
  status: "sending" | "sent" | "error" | "skipped";
  report: string;
  scope: string;
  recipients: string[];
  message: string;
};

export function ScheduleRunStatus({run, onClose}: {run: ScheduleRunState; onClose: () => void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const sending = run.status === "sending";
  const appearance = {
    sending: {title: "Sending report…", icon: RefreshCw, color: "text-blue-600", background: "bg-blue-50", accent: "bg-blue-500"},
    sent: {title: "Report sent", icon: CheckCircle, color: "text-emerald-600", background: "bg-emerald-50", accent: "bg-emerald-500"},
    error: {title: "Could not confirm sending", icon: AlertCircle, color: "text-rose-600", background: "bg-rose-50", accent: "bg-rose-500"},
    skipped: {title: "Report not sent", icon: Info, color: "text-amber-600", background: "bg-amber-50", accent: "bg-amber-500"},
  }[run.status];
  const Icon = appearance.icon;

  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => {
      element?.close();
      if (trigger?.isConnected) trigger.focus({preventScroll: true});
    };
  }, []);

  return <dialog ref={dialog} data-schedule-run-status={run.status} aria-labelledby={`${id}-title`} aria-describedby={`${id}-message`}
    onCancel={event => {event.preventDefault(); if (!sending) onClose();}}
    className="m-auto w-[calc(100%_-_2rem)] max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border-0 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-900/50 backdrop:backdrop-blur-sm">
    <div className={`h-1.5 ${appearance.accent}`} />
    <div className="p-6 sm:p-8">
      <div role="status" aria-live="polite" aria-atomic="true">
        <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${appearance.background} ${appearance.color}`}>
          <Icon aria-hidden="true" className={`h-7 w-7 ${sending ? 'animate-spin' : ''}`} />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Report delivery</p>
        <h2 id={`${id}-title`} className="mt-1 text-xl font-bold text-slate-900">{appearance.title}</h2>
        <p id={`${id}-message`} className="mt-2 max-h-36 overflow-y-auto text-sm leading-relaxed text-slate-600 whitespace-pre-wrap [overflow-wrap:anywhere]">{run.message}</p>
      </div>

      <div className="mt-5 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div>
          <p className="text-xs font-bold text-slate-800">{run.report}</p>
          <p className="mt-1 text-xs text-slate-500">{run.scope}</p>
        </div>
        <div className="border-t border-slate-200 pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
            <Mail aria-hidden="true" className="h-3.5 w-3.5" /> Recipients ({run.recipients.length})
          </p>
          <ul className="max-h-28 overflow-y-auto space-y-1 text-xs text-slate-700">
            {run.recipients.map(email => <li key={email} className="[overflow-wrap:anywhere]">{email}</li>)}
          </ul>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
        <p className="text-[11px] text-slate-500">{sending ? "Please wait while your report is prepared and sent." : run.status === "sent" ? "Accepted by the email service for delivery." : "Review the message above for details."}</p>
        <button type="button" disabled={sending} onClick={onClose}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60">
          {sending && <RefreshCw aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}{sending ? "Sending…" : "Done"}
        </button>
      </div>
    </div>
  </dialog>;
}
