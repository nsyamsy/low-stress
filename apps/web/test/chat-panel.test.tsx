import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import i18n from "../src/i18n";
import { PublicChatPanel } from "../src/features/chat/PublicChatPanel";
import * as authModule from "../src/features/auth";
import * as socketIoClient from "socket.io-client";

vi.mock("socket.io-client", () => {
  const fakeSocket = {
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
  return {
    io: vi.fn(() => fakeSocket),
  };
});

describe("P8-03: Panel chat desktop >= 1024px", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      user: {
        id: "user-1",
        username: "budi",
        displayName: "Budi",
        role: "user",
        status: "active",
      },
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
  });

  afterEach(() => {
    globalThis.window = originalWindow;
  });

  it("pada 768px (mobile/tablet) tidak merender panel dan tidak membuka soket", () => {
    globalThis.window = {
      innerWidth: 768,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window & typeof globalThis;

    const html = renderToString(
      <MemoryRouter>
        <I18nextProvider i18n={i18n}>
          <PublicChatPanel />
        </I18nextProvider>
      </MemoryRouter>,
    );

    // Komponen tidak merender apa pun di DOM
    expect(html).toBe("");

    // Soket sama sekali TIDAK pernah diinisialisasi
    expect(socketIoClient.io).not.toHaveBeenCalled();
  });

  it("pada 1024px (desktop) merender panel chat", async () => {
    await i18n.changeLanguage("id");
    globalThis.window = {
      innerWidth: 1024,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window & typeof globalThis;

    const html = renderToString(
      <MemoryRouter>
        <I18nextProvider i18n={i18n}>
          <PublicChatPanel />
        </I18nextProvider>
      </MemoryRouter>,
    );

    expect(html).toContain("Chat publik");
    expect(html).toContain("Belum ada pesan. Sapa yang lain!");
  });
});
