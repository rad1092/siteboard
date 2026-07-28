import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import { cloneDocument, demoDocument } from "./data";
import {
  DOCUMENT_BACKUP_KEY,
  DOCUMENT_RECOVERY_KEY,
  DOCUMENT_STORAGE_KEY,
} from "./storage";

function mockDownloads() {
  if (!URL.createObjectURL) {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: () => "blob:siteboard-test",
    });
  }
  if (!URL.revokeObjectURL) {
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: () => undefined,
    });
  }

  const createObjectUrl = vi
    .spyOn(URL, "createObjectURL")
    .mockReturnValue("blob:siteboard-test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => undefined);

  return { click, createObjectUrl };
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () =>
      reject(reader.error ?? new Error("Blob read failed")),
    );
    reader.readAsText(blob);
  });
}

describe("Siteboard app", () => {
  it("renders the editor, neutral demo pages, and an enabled HTML export", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Siteboard" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: /^Home\s*\/home$/ }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /^Services\s*\/services$/ }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /^About\s*\/about$/ }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Export HTML" }),
    ).toBeEnabled();
    expect(
      screen.getByTitle("Home desktop preview"),
    ).toHaveAttribute("srcdoc");
  });

  it("adds a page and reflects content edits in the live preview", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "+ Page" }));
    expect(screen.getByDisplayValue("Untitled page 4")).toBeVisible();

    const heading = screen.getByLabelText("Heading");
    fireEvent.change(heading, { target: { value: "A precise new heading" } });

    const preview = screen.getByTitle(
      "Untitled page 4 desktop preview",
    );
    expect(preview.getAttribute("srcdoc")).toContain(
      "A precise new heading",
    );
  });

  it("supports document undo and mobile preview", () => {
    render(<App />);
    const heading = screen.getByLabelText("Heading");
    const original = (heading as HTMLInputElement).value;
    fireEvent.change(heading, { target: { value: "Changed once" } });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByLabelText("Heading")).toHaveValue(original);

    fireEvent.click(screen.getByRole("button", { name: "Mobile" }));
    expect(screen.getByRole("button", { name: "Mobile" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTitle("Home mobile preview")).toBeVisible();
  });

  it("shows validation errors and blocks HTML export", () => {
    const downloads = mockDownloads();
    render(<App />);
    fireEvent.change(screen.getByLabelText(/URL slug/), {
      target: { value: "Bad Slug!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Check/ }));

    expect(
      screen.getAllByText(/not a valid lowercase URL slug/)[0],
    ).toBeVisible();
    const exportButton = screen.getByRole("button", {
      name: "Export HTML",
    });
    expect(exportButton).toHaveAttribute("aria-disabled", "true");
    expect(exportButton).toHaveAttribute("aria-describedby", "export-status");
    expect(
      screen.getByText(/HTML export blocked by 1 error/),
    ).toBeVisible();
    expect(
      exportButton.parentElement?.querySelector("#export-status"),
    ).toBeTruthy();
    fireEvent.click(exportButton);
    expect(downloads.click).not.toHaveBeenCalled();
  });

  it("restores the demo only after confirmation", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Reset demo" }));
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(screen.getAllByDisplayValue("Home")).toHaveLength(2);
  });

  it("keeps a corrupt save untouched until the user accepts recovery", () => {
    const raw = '{"schemaVersion":1,"unfinished":';
    const backup = cloneDocument(demoDocument);
    backup.pages[0].sections[0].title = "Last known-good heading";
    localStorage.setItem(DOCUMENT_STORAGE_KEY, raw);
    localStorage.setItem(DOCUMENT_BACKUP_KEY, JSON.stringify(backup));

    render(<App />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Siteboard could not read the saved document",
    );
    expect(screen.getByLabelText("Heading")).toHaveValue(
      "Last known-good heading",
    );
    expect(localStorage.getItem(DOCUMENT_STORAGE_KEY)).toBe(raw);

    fireEvent.click(
      screen.getByRole("button", { name: "Use last valid backup" }),
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(localStorage.getItem(DOCUMENT_RECOVERY_KEY)).toBe(raw);
    expect(
      JSON.parse(localStorage.getItem(DOCUMENT_STORAGE_KEY) ?? "{}").pages[0]
        .sections[0].title,
    ).toBe("Last known-good heading");
  });

  it("downloads a pre-import backup, confirms replacement, and clears history", async () => {
    const downloads = mockDownloads();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const imported = cloneDocument(demoDocument);
    imported.pages[0].sections[0].title = "Imported heading";

    render(<App />);
    fireEvent.change(screen.getByLabelText("Heading"), {
      target: { value: "Keep this in the backup" },
    });
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();

    fireEvent.change(
      screen.getByLabelText("Choose Siteboard JSON to import"),
      {
        target: {
          files: [
            new File([JSON.stringify(imported)], "replacement.json", {
              type: "application/json",
            }),
          ],
        },
      },
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Heading")).toHaveValue(
        "Imported heading",
      );
    });

    expect(confirm).toHaveBeenCalledWith(
      expect.stringMatching(/download a JSON backup first.*clears Undo and Redo/s),
    );
    expect(downloads.click).toHaveBeenCalledOnce();
    const backupBlob = downloads.createObjectUrl.mock.calls[0][0] as Blob;
    await expect(readBlob(backupBlob)).resolves.toContain(
      "Keep this in the backup",
    );
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
    expect(
      screen.getByText(/Undo and Redo history were cleared/),
    ).toBeVisible();
  });

  it("leaves the document and history unchanged when import is cancelled", async () => {
    const downloads = mockDownloads();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const imported = cloneDocument(demoDocument);
    imported.pages[0].sections[0].title = "Should not appear";

    render(<App />);
    fireEvent.change(screen.getByLabelText("Heading"), {
      target: { value: "Current work stays" },
    });
    fireEvent.change(
      screen.getByLabelText("Choose Siteboard JSON to import"),
      {
        target: {
          files: [
            new File([JSON.stringify(imported)], "cancelled.json", {
              type: "application/json",
            }),
          ],
        },
      },
    );

    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());

    expect(screen.getByLabelText("Heading")).toHaveValue(
      "Current work stays",
    );
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    expect(downloads.click).not.toHaveBeenCalled();
    expect(screen.getByText(/Import cancelled/)).toBeVisible();
  });
});
