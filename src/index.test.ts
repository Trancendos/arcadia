import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArcadiaService } from "./index";

describe("ArcadiaService", () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

  beforeEach(() => {
    logSpy.mockClear();
  });

  afterEach(() => {
    logSpy.mockClear();
  });

  it("returns active status", () => {
    const service = new ArcadiaService();
    expect(service.getStatus()).toEqual({ name: "arcadia", status: "active" });
  });

  it("logs startup and shutdown events", async () => {
    const service = new ArcadiaService();
    await service.start();
    await service.stop();

    expect(logSpy).toHaveBeenCalledWith("[arcadia] Starting...");
    expect(logSpy).toHaveBeenCalledWith("[arcadia] Stopping...");
  });
});
