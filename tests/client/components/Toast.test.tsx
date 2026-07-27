/// <reference lib="dom" />

import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import { ToastProvider, useToast } from "@/client/components/Toast";

function Trigger({
  message,
  type,
  id,
}: {
  message: string;
  type?: "success" | "error" | "warning" | "info";
  id?: string;
}) {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => showToast(message, type, id)}>
      fire
    </button>
  );
}

describe("Toast", () => {
  afterEach(() => cleanup());

  test("shows toast message when showToast is called", () => {
    render(
      <ToastProvider>
        <Trigger message="Saved" type="success" />
      </ToastProvider>,
    );
    const button = screen.getByRole("button", { name: "fire" });
    act(() => button.click());
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  test("updates existing toast by id instead of stacking", () => {
    const view = render(
      <ToastProvider>
        <Trigger message="First" id="same" />
      </ToastProvider>,
    );
    act(() => screen.getByRole("button", { name: "fire" }).click());
    view.rerender(
      <ToastProvider>
        <Trigger message="Second" id="same" />
      </ToastProvider>,
    );
    act(() => screen.getByRole("button", { name: "fire" }).click());
    expect(screen.queryByText("First")).not.toBeInTheDocument();
    expect(screen.getAllByText("Second")).toHaveLength(1);
  });

  test("throws when useToast used outside provider", () => {
    function Consumer() {
      useToast();
      return null;
    }
    expect(() => render(<Consumer />)).toThrow(/ToastProvider/);
  });
});
