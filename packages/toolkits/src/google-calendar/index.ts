import { z } from "zod"
import { defineTool, defineToolkit, oauth2 } from "../core/index"
import { generatedTools } from "./generated/index"

// A calendar event time is either an all-day `date` or a `dateTime` (+ tz).
const eventTime = z.object({
  date: z.string().optional().describe("All-day date, YYYY-MM-DD"),
  dateTime: z.string().optional().describe("RFC3339 timestamp, e.g. 2026-07-06T15:00:00-04:00"),
  timeZone: z.string().optional().describe("IANA tz, e.g. Europe/Rome"),
})

const CAL = "calendarId defaults to 'primary'"

export default defineToolkit({
  slug: "google-calendar",
  name: "Google Calendar",
  auth: oauth2({
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/calendar"],
    authorizeParams: { access_type: "offline", prompt: "consent" },
  }),
  authProvider: "google",
  baseUrl: "https://www.googleapis.com/calendar/v3",
  usage: `Tools for a connected Google Calendar. Every tool defaults \`calendarId\` to \`primary\`; pass a calendar id (from \`list_calendars\`) to target another.

- \`list_events\` filters by \`timeMin\`/\`timeMax\` (RFC3339) and text \`q\`. It sets \`singleEvents=true\` so recurring events expand into instances.
- \`create_event\`/\`update_event\` take \`start\`/\`end\` as \`{ dateTime, timeZone }\` (timed) or \`{ date }\` (all-day). \`attendees\` is a list of emails.
- \`quick_add\` creates an event from natural language, e.g. "Lunch with Sam tomorrow 1pm".
- \`delete_event\` removes an event by id.
- \`free_busy\` returns busy intervals for one or more calendars in a window — use it to find open slots before creating an event.`,
  tools: [
    defineTool({
      slug: "list_calendars",
      description: "List the user's calendars",
      input: z.object({}),
      execute: (_input, ctx) => ctx.fetch("/users/me/calendarList"),
    }),
    defineTool({
      slug: "list_events",
      description: "List/search events in a calendar within an optional time window",
      input: z.object({
        calendarId: z.string().optional().describe(CAL),
        q: z.string().optional(),
        timeMin: z.string().optional().describe("RFC3339 lower bound"),
        timeMax: z.string().optional().describe("RFC3339 upper bound"),
        maxResults: z.number().int().min(1).max(2500).optional(),
        pageToken: z.string().optional(),
      }),
      execute: ({ calendarId = "primary", ...q }, ctx) => {
        const qs = new URLSearchParams({ singleEvents: "true", orderBy: "startTime" })
        for (const [k, v] of Object.entries(q)) if (v !== undefined) qs.set(k, String(v))
        return ctx.fetch(`/calendars/${encodeURIComponent(calendarId)}/events?${qs}`)
      },
    }),
    defineTool({
      slug: "get_event",
      description: "Get a single event by id",
      input: z.object({
        eventId: z.string(),
        calendarId: z.string().optional().describe(CAL),
      }),
      execute: ({ calendarId = "primary", eventId }, ctx) =>
        ctx.fetch(
          `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
        ),
    }),
    defineTool({
      slug: "create_event",
      description: "Create an event",
      input: z.object({
        calendarId: z.string().optional().describe(CAL),
        summary: z.string(),
        description: z.string().optional(),
        location: z.string().optional(),
        start: eventTime,
        end: eventTime,
        attendees: z.array(z.string()).optional().describe("Attendee email addresses"),
      }),
      execute: ({ calendarId = "primary", attendees, ...body }, ctx) =>
        ctx.fetch(`/calendars/${encodeURIComponent(calendarId)}/events`, {
          method: "POST",
          body: { ...body, ...(attendees ? { attendees: attendees.map((email) => ({ email })) } : {}) },
        }),
    }),
    defineTool({
      slug: "update_event",
      description: "Update fields on an existing event (only the fields you pass)",
      input: z.object({
        calendarId: z.string().optional().describe(CAL),
        eventId: z.string(),
        summary: z.string().optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        start: eventTime.optional(),
        end: eventTime.optional(),
        attendees: z.array(z.string()).optional(),
      }),
      execute: ({ calendarId = "primary", eventId, attendees, ...patch }, ctx) =>
        ctx.fetch(
          `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
          {
            method: "PATCH",
            body: { ...patch, ...(attendees ? { attendees: attendees.map((email) => ({ email })) } : {}) },
          }
        ),
    }),
    defineTool({
      slug: "quick_add",
      description: "Create an event from a natural-language phrase",
      input: z.object({
        text: z.string().describe("e.g. 'Lunch with Sam tomorrow 1pm'"),
        calendarId: z.string().optional().describe(CAL),
      }),
      execute: ({ calendarId = "primary", text }, ctx) =>
        ctx.fetch(
          `/calendars/${encodeURIComponent(calendarId)}/events/quickAdd?text=${encodeURIComponent(text)}`,
          { method: "POST" }
        ),
    }),
    defineTool({
      slug: "delete_event",
      description: "Delete an event by id",
      input: z.object({
        eventId: z.string(),
        calendarId: z.string().optional().describe(CAL),
      }),
      execute: ({ calendarId = "primary", eventId }, ctx) =>
        ctx.fetch(
          `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
          { method: "DELETE" }
        ),
    }),
    defineTool({
      slug: "free_busy",
      description: "Get busy time intervals for calendars in a window (to find open slots)",
      input: z.object({
        timeMin: z.string().describe("RFC3339 lower bound"),
        timeMax: z.string().describe("RFC3339 upper bound"),
        calendarIds: z.array(z.string()).optional().describe("defaults to ['primary']"),
        timeZone: z.string().optional(),
      }),
      execute: (input, ctx) =>
        ctx.fetch("/freeBusy", {
          method: "POST",
          body: {
            timeMin: input.timeMin,
            timeMax: input.timeMax,
            timeZone: input.timeZone,
            items: (input.calendarIds ?? ["primary"]).map((id) => ({ id })),
          },
        }),
    }),
    // Full Calendar API surface (default:false — opt-in), generated from discovery.
    ...generatedTools,
  ],
})
