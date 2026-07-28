import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

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
    render(<App />);
    fireEvent.change(screen.getByLabelText(/URL slug/), {
      target: { value: "Bad Slug!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Check/ }));

    expect(screen.getByText(/not a valid lowercase URL slug/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Export HTML" }),
    ).toBeDisabled();
  });

  it("restores the demo only after confirmation", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Reset demo" }));
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(screen.getAllByDisplayValue("Home")).toHaveLength(2);
  });
});
