import { describe, expect, it } from "vitest";
import { getTranslator, isAppLanguage } from "./i18n";

describe("i18n", () => {
  it("validates supported app languages", () => {
    expect(isAppLanguage("zh-CN")).toBe(true);
    expect(isAppLanguage("en")).toBe(true);
    expect(isAppLanguage("de")).toBe(false);
  });

  it("translates and interpolates values", () => {
    const t = getTranslator("en");

    expect(t("settings.language")).toBe("App language");
    expect(t("library.epubCount", { count: 3 })).toBe("3 EPUBs");
  });

  it("falls back to simplified Chinese by default", () => {
    const t = getTranslator();

    expect(t("settings.language")).toBe("应用语言");
  });
});
