import { describe, expect, it } from "vitest";
import { Db } from "../src/db/Database";

/**
 * The driver's own behaviour, as opposed to the queries written against it.
 *
 * These exist because `Db` began caching prepared statements. That turns one
 * plan into a long-lived object shared by every later caller, so the things
 * worth pinning are the ones a cache can quietly break: that parameters are
 * still bound per call, that writes are still seen by the next read, and that
 * a statement never outlives the connection it was prepared on.
 */
describe("Db", () => {
  const open = (): Db => {
    const db = Db.open(":memory:");
    db.run("CREATE TABLE t (k TEXT PRIMARY KEY, v INTEGER NOT NULL)");
    return db;
  };

  it("binds parameters per call, not once per statement", () => {
    const db = open();
    db.run("INSERT INTO t (k, v) VALUES (?, ?)", ["a", 1]);
    db.run("INSERT INTO t (k, v) VALUES (?, ?)", ["b", 2]);

    const read = "SELECT v FROM t WHERE k = ?";
    // The same SQL, twice, with different arguments. A cache that held results
    // rather than plans would answer the second with the first one's row.
    expect(db.one<{ v: number }>(read, ["a"])?.v).toBe(1);
    expect(db.one<{ v: number }>(read, ["b"])?.v).toBe(2);
    db.close();
  });

  it("sees a write made after the read statement was first used", () => {
    const db = open();
    const read = "SELECT count(*) AS n FROM t";

    expect(db.one<{ n: number }>(read)?.n, "a measured zero").toBe(0);
    db.run("INSERT INTO t (k, v) VALUES (?, ?)", ["a", 1]);
    // A re-used plan must still be re-executed. Caching the row here would
    // make the dashboard show the corpus as it was when the server booted.
    expect(db.one<{ n: number }>(read)?.n).toBe(1);
    db.close();
  });

  it("gives the same answers to a repeated query as to a fresh one", () => {
    const db = open();
    for (const [k, v] of [["a", 1], ["b", 2], ["c", 3]] as const) {
      db.run("INSERT INTO t (k, v) VALUES (?, ?)", [k, v]);
    }

    const all = "SELECT k, v FROM t ORDER BY k";
    const first = db.all<{ k: string; v: number }>(all);
    const second = db.all<{ k: string; v: number }>(all);

    expect(second).toEqual(first);
    expect(second).toHaveLength(3);
    db.close();
  });

  it("rolls a transaction back without poisoning the cached statements", () => {
    const db = open();
    db.run("INSERT INTO t (k, v) VALUES (?, ?)", ["a", 1]);

    expect(() =>
      db.transaction(() => {
        db.run("INSERT INTO t (k, v) VALUES (?, ?)", ["b", 2]);
        throw new Error("nope");
      }),
    ).toThrow("nope");

    // The failed insert is gone and the connection still works, using the very
    // statements the rolled-back transaction ran through.
    expect(db.one<{ n: number }>("SELECT count(*) AS n FROM t")?.n).toBe(1);
    db.run("INSERT INTO t (k, v) VALUES (?, ?)", ["c", 3]);
    expect(db.one<{ n: number }>("SELECT count(*) AS n FROM t")?.n).toBe(2);
    db.close();
  });

  it("closes cleanly after its statements have been used", () => {
    const db = open();
    db.run("INSERT INTO t (k, v) VALUES (?, ?)", ["a", 1]);
    db.all("SELECT * FROM t");
    // A cached statement outliving its connection is a use-after-free waiting
    // for the next caller, so closing has to drop them first.
    expect(() => db.close()).not.toThrow();
  });
});
