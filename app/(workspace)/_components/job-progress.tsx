import type { JobEvent, JobState } from "../../../lib/job-contract";
import { Chip, ProgressBar } from "./ui";

/**
 * Presentation mapping for the five contract job states. `running` was
 * previously missing here while a dead `processing` key sat in its place, so
 * an in-flight job rendered as neutral.
 */
export const jobStateTone: Record<
  JobState,
  "green" | "amber" | "red" | "neutral"
> = {
  blocked: "amber",
  completed: "green",
  failed: "red",
  queued: "neutral",
  running: "green",
};

export const jobStateLabel: Record<JobState, string> = {
  blocked: "Needs approval",
  completed: "Completed",
  failed: "Failed",
  queued: "Queued",
  running: "Running",
};

const stageOrder = [
  "Queued",
  "Transcribe",
  "Translate",
  "Authorize",
  "Speech",
  "Time-fit QA",
  "Compose",
];

/** Rough completion for the header bar; the event log stays authoritative. */
function completionRatio(state: JobState, eventCount: number) {
  if (state === "completed") return 100;
  if (state === "failed") return 100;
  const observed = Math.min(eventCount, stageOrder.length);
  return Math.round((observed / (stageOrder.length + 1)) * 100);
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function JobProgressSummary({
  eventCount,
  state,
}: {
  eventCount: number;
  state: JobState;
}) {
  const live = state === "queued" || state === "running";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Chip pulse={live} tone={jobStateTone[state]}>
          {jobStateLabel[state]}
        </Chip>
        <span className="font-mono text-caption text-slate-500">
          {eventCount} stage {eventCount === 1 ? "record" : "records"}
        </span>
      </div>
      <ProgressBar
        indeterminate={state === "running"}
        value={completionRatio(state, eventCount)}
      />
    </div>
  );
}

export function StageTimeline({
  events,
  state,
}: {
  events: JobEvent[];
  state: JobState;
}) {
  const live = state === "queued" || state === "running";

  if (events.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-200 bg-cream/60 px-5 py-8 text-center text-body text-slate-500">
        No stage records yet. The first append-only event appears once the
        worker claims this job.
      </p>
    );
  }

  return (
    <ol className="relative flex flex-col">
      {events.map((event, index) => {
        const last = index === events.length - 1;
        const current = last && live;
        const failed = event.state === "failed";
        const needsApproval = event.state === "blocked";

        return (
          <li className="relative flex gap-4 pb-5 last:pb-0" key={
            `${event.sequence}-${event.stage}-${event.created_at}`
          }>
            {!last && (
              <span
                aria-hidden="true"
                className="absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px bg-slate-200"
              />
            )}

            <span
              aria-hidden="true"
              className={`relative z-10 mt-0.5 flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full border-2 font-mono text-label font-bold ${
                failed
                  ? "border-fit-red bg-fit-red text-white"
                  : needsApproval
                    ? "border-fit-amber bg-fit-amber text-white"
                    : current
                      ? "border-ink bg-white text-ink"
                      : "border-fit-green bg-fit-green text-white"
              }`}
            >
              {current ? (
                <span className="h-2 w-2 animate-pulse-dot rounded-full bg-ink" />
              ) : failed ? (
                "!"
              ) : needsApproval ? (
                "!"
              ) : (
                "✓"
              )}
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <strong className="text-body font-semibold text-ink">
                  {event.label}
                </strong>
                <time
                  className="font-mono text-micro text-slate-400"
                  dateTime={event.created_at}
                >
                  {timeLabel(event.created_at)}
                </time>
              </div>
              <p className="mt-0.5 text-caption leading-relaxed text-slate-500">
                {event.message}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
