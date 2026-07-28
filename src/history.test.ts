import { describe, expect, it } from "vitest";
import { cloneDocument, demoDocument } from "./data";
import { createHistory, historyReducer } from "./history";

describe("historyReducer", () => {
  it("undoes and redoes a document commit", () => {
    const initial = cloneDocument(demoDocument);
    const edited = cloneDocument(initial);
    edited.site.name = "Edited site";

    const committed = historyReducer(createHistory(initial), {
      type: "commit",
      document: edited,
    });
    expect(committed.present.site.name).toBe("Edited site");

    const undone = historyReducer(committed, { type: "undo" });
    expect(undone.present.site.name).toBe("Harbor Bike Workshop");

    const redone = historyReducer(undone, { type: "redo" });
    expect(redone.present.site.name).toBe("Edited site");
  });

  it("clears redo history after a new commit", () => {
    const initial = cloneDocument(demoDocument);
    const first = cloneDocument(initial);
    first.site.name = "First";
    const second = cloneDocument(initial);
    second.site.name = "Second";

    const committed = historyReducer(createHistory(initial), {
      type: "commit",
      document: first,
    });
    const undone = historyReducer(committed, { type: "undo" });
    const branched = historyReducer(undone, {
      type: "commit",
      document: second,
    });

    expect(branched.future).toEqual([]);
  });
});
