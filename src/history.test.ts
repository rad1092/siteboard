import { describe, expect, it } from "vitest";
import { cloneDocument } from "./data";
import { createHistory, historyReducer } from "./history";
import { completeDocument } from "./test/fixture";

describe("historyReducer", () => {
  it("문서 변경을 되돌리고 다시 실행한다", () => {
    const initial = completeDocument();
    const edited = cloneDocument(initial);
    edited.site.name = "변경한 이름";

    const committed = historyReducer(createHistory(initial), {
      type: "commit",
      document: edited,
    });
    expect(committed.present.site.name).toBe("변경한 이름");

    const undone = historyReducer(committed, { type: "undo" });
    expect(undone.present.site.name).toBe("모서리 공방");

    const redone = historyReducer(undone, { type: "redo" });
    expect(redone.present.site.name).toBe("변경한 이름");
  });

  it("되돌린 뒤 새 변경을 저장하면 다시 실행 기록을 비운다", () => {
    const initial = completeDocument();
    const first = cloneDocument(initial);
    first.site.name = "첫 변경";
    const second = cloneDocument(initial);
    second.site.name = "새 갈래";

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
