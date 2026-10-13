import { afterEach, describe, expect, it } from "vitest";
import { setTheme } from "../../src/core/themeStore";

const accent = () => document.documentElement.style.getPropertyValue("--nb-accent");

describe("theme changes keep the user's colour choices", () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-colorblind");
  });

  it("keeps the colourblind palette when the theme changes", () => {
    localStorage.setItem("settings:colorblindPalette", "true");
    setTheme("cyberpunk");
    expect(document.documentElement.getAttribute("data-colorblind")).toBe("true");
    expect(accent()).not.toBe("");
    const colourblindAccent = accent();
    setTheme("nord");
    expect(accent()).toBe(colourblindAccent);
  });

  it("keeps the accent chosen in Settings when the theme changes", () => {
    localStorage.setItem("settings:accentColor", "#7cffb0");
    setTheme("cyberpunk");
    expect(accent()).not.toBe("");
  });

  it("uses the theme's own accent when nothing is overridden", () => {
    setTheme("cyberpunk");
    expect(accent()).toBe("");
  });

  it("lets a per-theme tint win over the global accent", () => {
    localStorage.setItem("settings:accentColor", "#7cffb0");
    localStorage.setItem("settings:themeCustom:nord", JSON.stringify({ tint: "#ff0000" }));
    setTheme("nord");
    const tinted = accent();
    setTheme("cyberpunk");
    expect(accent()).not.toBe(tinted);
  });
});
