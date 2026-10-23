import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  diningTables,
  restaurants,
  rooms,
  services,
  tableAdjacencies,
  type DatabaseHandle,
} from "../src/index.js";
import { createTestDatabase } from "../src/testing.js";

let handle: DatabaseHandle;

beforeAll(async () => {
  handle = await createTestDatabase();
});

afterAll(async () => {
  await handle.close();
});

async function seedRestaurant(slug: string) {
  const { db } = handle;
  const [restaurant] = await db.insert(restaurants).values({ slug, name: slug }).returning();
  const [room] = await db.insert(rooms).values({ restaurantId: restaurant!.id, name: "Sala" }).returning();
  return { restaurant: restaurant!, room: room! };
}

/** Drizzle wraps driver errors; the Postgres message is on `cause`. */
async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const err = error as Error & { cause?: Error };
    return `${err.message} ${err.cause?.message ?? ""}`;
  }
  throw new Error("Expected the query to fail");
}

describe("database constraints", () => {
  it("refuses to place a table in another restaurant's room", async () => {
    const a = await seedRestaurant("a");
    const b = await seedRestaurant("b");
    const message = await failure(
      handle.db
        .insert(diningTables)
        .values({ restaurantId: a.restaurant.id, roomId: b.room.id, name: "1", minCovers: 1, maxCovers: 2 }),
    );
    expect(message).toMatch(/foreign key/);
  });

  it("refuses inverted cover ranges", async () => {
    const a = await seedRestaurant("c");
    const message = await failure(
      handle.db
        .insert(diningTables)
        .values({ restaurantId: a.restaurant.id, roomId: a.room.id, name: "1", minCovers: 4, maxCovers: 2 }),
    );
    expect(message).toMatch(/tables_covers_range/);
  });

  it("stores adjacency edges in canonical order only", async () => {
    const a = await seedRestaurant("d");
    const created = await handle.db
      .insert(diningTables)
      .values([
        { restaurantId: a.restaurant.id, roomId: a.room.id, name: "1", minCovers: 1, maxCovers: 2 },
        { restaurantId: a.restaurant.id, roomId: a.room.id, name: "2", minCovers: 1, maxCovers: 2 },
      ])
      .returning();
    const [low, high] = created.map((t) => t.id).sort();
    await handle.db
      .insert(tableAdjacencies)
      .values({ restaurantId: a.restaurant.id, tableAId: low!, tableBId: high! });
    const message = await failure(
      handle.db
        .insert(tableAdjacencies)
        .values({ restaurantId: a.restaurant.id, tableAId: high!, tableBId: low! }),
    );
    expect(message).toMatch(/table_adjacencies_ordered/);
  });

  it("refuses weekdays outside 1-7", async () => {
    const a = await seedRestaurant("e");
    const message = await failure(
      handle.db.insert(services).values({
        restaurantId: a.restaurant.id,
        name: "Cena",
        daysOfWeek: [0],
        firstArrival: "19:00",
        lastArrival: "22:00",
      }),
    );
    expect(message).toMatch(/services_days_of_week/);
  });

  it("returns time columns with seconds, which the API normalizes", async () => {
    const a = await seedRestaurant("f");
    const [service] = await handle.db
      .insert(services)
      .values({
        restaurantId: a.restaurant.id,
        name: "Cena",
        daysOfWeek: [5],
        firstArrival: "19:00",
        lastArrival: "22:00",
        fixedSeatings: ["19:30"],
      })
      .returning();
    expect(service?.firstArrival).toBe("19:00:00");
    expect(service?.fixedSeatings).toEqual(["19:30:00"]);
  });
});
