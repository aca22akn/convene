// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { CreateEvent } from "@/components/CreateEvent";
import { DirectoryClient } from "@/components/DirectoryClient";
import { JoinForm } from "@/components/JoinForm";
import { OrganiserClient } from "@/components/OrganiserClient";

function unnamedFields(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input:not([type='hidden']), textarea, select")]
    .filter((field) => !field.getAttribute("aria-label") && !field.getAttribute("aria-labelledby") && field.labels?.length === 0)
    .map((field) => `${field.tagName.toLowerCase()}#${field.id || "(no id)"}`);
}

describe("form controls", () => {
  it("gives every visible input, textarea, and select a persistent programmatic name", () => {
    const { container } = render(
      <>
        <CreateEvent aiAvailable />
        <DirectoryClient slug="demo" mock />
        <JoinForm slug="demo" aiEnabled />
        <OrganiserClient slug="demo" mock />
      </>,
    );

    expect(unnamedFields(container)).toEqual([]);
  });
});
