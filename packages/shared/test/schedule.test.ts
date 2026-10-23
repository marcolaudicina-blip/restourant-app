import { describe, expect, it } from "vitest";
import { buildDaySchedule, type ScheduleException, type ScheduleService } from "../src/index.js";

const dinner: ScheduleService = {
  id: "dinner",
  name: "Cena",
  daysOfWeek: [2, 3, 4, 5, 6, 7],
  firstArrival: "19:00",
  lastArrival: "20:00",
  seatingMode: "continuous",
  slotIntervalMinutes: null,
  fixedSeatings: [],
  validFrom: null,
  validTo: null,
  onlineBookable: true,
  isActive: true,
  sortOrder: 1,
};

const lunch: ScheduleService = {
  ...dinner,
  id: "lunch",
  name: "Pranzo",
  firstArrival: "12:00",
  lastArrival: "13:00",
  sortOrder: 0,
};

const exception = (overrides: Partial<ScheduleException>): ScheduleException => ({
  id: "ex1",
  kind: "closed",
  scope: "all",
  dateFrom: "2026-10-24",
  dateTo: "2026-10-24",
  serviceId: null,
  firstArrival: null,
  lastArrival: null,
  note: null,
  ...overrides,
});

const SATURDAY = "2026-10-24";
const MONDAY = "2026-10-26";

function schedule(
  overrides: {
    services?: ScheduleService[];
    exceptions?: ScheduleException[];
    date?: string;
    channel?: "staff" | "online";
  } = {},
) {
  return buildDaySchedule({
    date: overrides.date ?? SATURDAY,
    channel: overrides.channel ?? "staff",
    defaultSlotIntervalMinutes: 15,
    services: overrides.services ?? [dinner],
    exceptions: overrides.exceptions ?? [],
  });
}

describe("buildDaySchedule", () => {
  it("generates continuous slots using the restaurant interval", () => {
    const [cena] = schedule();
    expect(cena).toMatchObject({ status: "open", slots: ["19:00", "19:15", "19:30", "19:45", "20:00"] });
  });

  it("uses the service interval when set", () => {
    const [cena] = schedule({ services: [{ ...dinner, slotIntervalMinutes: 30 }] });
    expect(cena?.slots).toEqual(["19:00", "19:30", "20:00"]);
  });

  it("returns fixed seatings in order", () => {
    const [cena] = schedule({
      services: [
        { ...dinner, seatingMode: "fixed", lastArrival: "21:30", fixedSeatings: ["21:30", "19:30"] },
      ],
    });
    expect(cena?.slots).toEqual(["19:30", "21:30"]);
  });

  it("orders services by sortOrder", () => {
    expect(schedule({ services: [dinner, lunch] }).map((s) => s.serviceId)).toEqual(["lunch", "dinner"]);
  });

  it("is closed on days the service does not run", () => {
    const [cena] = schedule({ date: MONDAY });
    expect(cena).toMatchObject({ status: "closed", reason: "not_scheduled_day", slots: [] });
  });

  it("respects the seasonal validity", () => {
    const [cena] = schedule({ services: [{ ...dinner, validFrom: "2026-06-01", validTo: "2026-09-30" }] });
    expect(cena).toMatchObject({ status: "closed", reason: "out_of_season" });
  });

  it("is closed when the service is inactive", () => {
    const [cena] = schedule({ services: [{ ...dinner, isActive: false }] });
    expect(cena).toMatchObject({ status: "closed", reason: "inactive" });
  });

  it("applies a full-day closure to every service", () => {
    const result = schedule({ services: [lunch, dinner], exceptions: [exception({ note: "Ferie" })] });
    expect(result.every((s) => s.status === "closed" && s.reason === "closed_exception")).toBe(true);
    expect(result[0]).toMatchObject({ exceptionId: "ex1", note: "Ferie" });
  });

  it("applies a closure to a single service", () => {
    const result = schedule({ services: [lunch, dinner], exceptions: [exception({ serviceId: "lunch" })] });
    expect(result.map((s) => s.status)).toEqual(["closed", "open"]);
  });

  it("ignores exceptions outside their date range", () => {
    const [cena] = schedule({ exceptions: [exception({ dateFrom: "2026-11-01", dateTo: "2026-11-05" })] });
    expect(cena?.status).toBe("open");
  });

  it("closes online only, keeping staff bookings open", () => {
    const onlineOnly = [exception({ scope: "online" })];
    expect(schedule({ exceptions: onlineOnly, channel: "staff" })[0]?.status).toBe("open");
    expect(schedule({ exceptions: onlineOnly, channel: "online" })[0]).toMatchObject({
      status: "closed",
      reason: "online_closed_exception",
    });
  });

  it("hides services that are not bookable online from the online channel only", () => {
    const services = [{ ...dinner, onlineBookable: false }];
    expect(schedule({ services, channel: "staff" })[0]?.status).toBe("open");
    expect(schedule({ services, channel: "online" })[0]).toMatchObject({ reason: "not_online_bookable" });
  });

  it("special hours override arrival times", () => {
    const special = exception({
      id: "nye",
      kind: "special_hours",
      serviceId: "dinner",
      firstArrival: "20:30",
      lastArrival: "21:00",
    });
    const [cena] = schedule({ exceptions: [special] });
    expect(cena).toMatchObject({
      status: "open",
      firstArrival: "20:30",
      specialHoursExceptionId: "nye",
      slots: ["20:30", "20:45", "21:00"],
    });
  });

  it("special hours open a service on a day it normally does not run", () => {
    const special = exception({
      kind: "special_hours",
      serviceId: "dinner",
      dateFrom: MONDAY,
      dateTo: MONDAY,
      firstArrival: "19:00",
      lastArrival: "19:30",
    });
    expect(schedule({ date: MONDAY, exceptions: [special] })[0]).toMatchObject({
      status: "open",
      slots: ["19:00", "19:15", "19:30"],
    });
  });

  it("closures win over special hours", () => {
    const special = exception({
      id: "sp",
      kind: "special_hours",
      serviceId: "dinner",
      firstArrival: "20:00",
      lastArrival: "21:00",
    });
    const closure = exception({ id: "cl" });
    expect(schedule({ exceptions: [special, closure] })[0]).toMatchObject({
      status: "closed",
      exceptionId: "cl",
    });
  });

  it("clips fixed seatings to special hours", () => {
    const services: ScheduleService[] = [
      { ...dinner, seatingMode: "fixed", lastArrival: "21:30", fixedSeatings: ["19:30", "21:30"] },
    ];
    const special = exception({
      kind: "special_hours",
      serviceId: "dinner",
      firstArrival: "19:00",
      lastArrival: "20:00",
    });
    expect(schedule({ services, exceptions: [special] })[0]?.slots).toEqual(["19:30"]);
  });
});
