// Turns Muntra's booking webhook payload (JSON:API) into the small,
// allow-listed row we store. Everything not picked here is dropped,
// including the patient's name, personal identity number, address,
// phone, e-mail and the booking's free-text fields.

export const TRIGGERS = ["created", "updated", "deleted"] as const;
export type Trigger = (typeof TRIGGERS)[number];

export function isTrigger(value: string | null): value is Trigger {
  return value !== null && (TRIGGERS as readonly string[]).includes(value);
}

export interface BookingRow {
  booking_id: number;
  clinic_id: number | null;
  patient_id: number | null;
  booking_type_id: number | null;
  booking_type_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  duration_minutes: number | null;
  status: string | null;
  patient_partstat: string | null;
  patient_arrived_at: string | null;
  is_new_patient: boolean;
  wants_earlier_slot: boolean;
  late_cancellation: boolean;
  failed_to_appear: boolean;
  failed_to_appear_handled: boolean;
  is_done: boolean;
  is_deleted: boolean;
  last_trigger: Trigger;
  last_event_at: string;
}

type Json = Record<string, unknown>;

function asObject(value: unknown): Json {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};
}

function toId(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

function toText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function toDate(value: unknown): string | null {
  const text = toText(value);
  if (!text) return null;
  return Number.isNaN(Date.parse(text)) ? null : text;
}

function toInt(value: unknown): number | null {
  const n = Number(value);
  return value === null || value === undefined || !Number.isFinite(n) ? null : Math.round(n);
}

function toBool(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function relationshipId(relationships: Json, name: string): number | null {
  return toId(asObject(asObject(relationships[name]).data).id);
}

function findIncluded(included: unknown, type: string): Json {
  if (!Array.isArray(included)) return {};
  return asObject(included.find((item) => asObject(item).type === type));
}

export function minimizeBooking(payload: unknown, trigger: Trigger, now = new Date()): BookingRow | null {
  const data = asObject(asObject(payload).data);
  const bookingId = toId(data.id);
  if (data.type !== "booking" || bookingId === null) return null;

  const attributes = asObject(data.attributes);
  const relationships = asObject(data.relationships);
  const included = asObject(payload).included;

  const attendee = asObject(findIncluded(included, "booking_attendee").attributes);
  const bookingType = findIncluded(included, "booking_type");

  return {
    booking_id: bookingId,
    clinic_id: relationshipId(relationships, "clinic"),
    patient_id: relationshipId(relationships, "patient"),
    booking_type_id: relationshipId(relationships, "booking_type") ?? toId(bookingType.id),
    booking_type_name: toText(asObject(bookingType.attributes).name),
    starts_at: toDate(attributes.dtstart),
    ends_at: toDate(attributes.dtend),
    duration_minutes: toInt(attributes.duration_in_minutes),
    status: toText(attributes.status),
    patient_partstat: toText(attendee.partstat),
    patient_arrived_at: toDate(attendee.arrived_at),
    is_new_patient: toBool(attributes.new_patient),
    wants_earlier_slot: toBool(attributes.patient_wants_earlier_slot),
    late_cancellation: toBool(attributes.patient_made_late_cancellation),
    failed_to_appear: toBool(attributes.patient_failed_to_appear),
    failed_to_appear_handled: toBool(attributes.patient_failed_to_appear_handled),
    is_done: toBool(attributes.done),
    is_deleted: trigger === "deleted",
    last_trigger: trigger,
    last_event_at: now.toISOString(),
  };
}
