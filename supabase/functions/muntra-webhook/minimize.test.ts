import assert from "node:assert/strict";
import { isTrigger, minimizeBooking } from "./minimize.ts";

const assertEquals = (actual: unknown, expected: unknown) => assert.deepEqual(actual, expected);
const assertFalse = (value: boolean, message?: string) => assert.equal(value, false, message);

const example = JSON.parse(
  await Deno.readTextFile(new URL("../../../fixtures/booking-webhook.example.json", import.meta.url)),
);

const SENSITIVE = [
  "Test", "Testsson", "19121212-1212", "+46700000000", "Påhittade", "test.testsson@example.com",
  "P-5521", "1912-12-12", "Tanja", "19800101-0000", "Patienten vill ha morgontid", "Basundersökning",
];

Deno.test("keeps the fields the dashboard needs", () => {
  const row = minimizeBooking(example, "created", new Date("2026-10-05T08:00:00Z"))!;
  assertEquals(row.booking_id, 48213);
  assertEquals(row.clinic_id, 12);
  assertEquals(row.patient_id, 5521);
  assertEquals(row.booking_type_id, 3);
  assertEquals(row.booking_type_name, "Undersökning");
  assertEquals(row.starts_at, "2026-10-08T09:00:00+02:00");
  assertEquals(row.duration_minutes, 45);
  assertEquals(row.status, "CONFIRMED");
  assertEquals(row.patient_partstat, "ACCEPTED");
  assertEquals(row.patient_arrived_at, null);
  assertEquals(row.wants_earlier_slot, true);
  assertEquals(row.is_deleted, false);
});

Deno.test("drops every piece of patient and staff identity", () => {
  const stored = JSON.stringify(minimizeBooking(example, "updated"));
  for (const value of SENSITIVE) {
    assertFalse(stored.includes(value), `stored row leaked "${value}"`);
  }
});

Deno.test("only allow-listed columns are produced", () => {
  const row = minimizeBooking(example, "created")!;
  assertEquals(Object.keys(row).sort(), [
    "booking_id", "booking_type_id", "booking_type_name", "clinic_id", "duration_minutes", "ends_at",
    "failed_to_appear", "failed_to_appear_handled", "is_deleted", "is_done", "is_new_patient",
    "last_event_at", "last_trigger", "late_cancellation", "patient_arrived_at", "patient_id",
    "patient_partstat", "starts_at", "status", "wants_earlier_slot",
  ]);
});

Deno.test("deleted trigger marks the booking deleted", () => {
  assertEquals(minimizeBooking(example, "deleted")!.is_deleted, true);
});

Deno.test("accepts 0/1 flags as booleans", () => {
  const payload = structuredClone(example);
  payload.data.attributes.patient_failed_to_appear = 1;
  payload.data.attributes.patient_made_late_cancellation = 0;
  const row = minimizeBooking(payload, "updated")!;
  assertEquals(row.failed_to_appear, true);
  assertEquals(row.late_cancellation, false);
});

Deno.test("booking without patient or includes still works", () => {
  const row = minimizeBooking({ data: { type: "booking", id: "7", attributes: { status: "TENTATIVE" } } }, "created")!;
  assertEquals(row.booking_id, 7);
  assertEquals(row.patient_id, null);
  assertEquals(row.booking_type_name, null);
});

Deno.test("rejects payloads that are not bookings", () => {
  assertEquals(minimizeBooking({ data: { type: "patient", id: "1" } }, "created"), null);
  assertEquals(minimizeBooking(null, "created"), null);
  assertEquals(minimizeBooking({ data: { type: "booking", id: "abc" } }, "created"), null);
});

Deno.test("only known triggers are accepted", () => {
  assertEquals(isTrigger("created"), true);
  assertEquals(isTrigger("signed"), false);
  assertEquals(isTrigger(null), false);
});
