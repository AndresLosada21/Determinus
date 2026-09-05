import { describe, expect, test } from "vitest";
import {
  DETERMINUS_SDD_SKILL,
  DETERMINUS_TDD_SKILL,
  getDeterminusSkillDefs,
  registerDeterminusSkills,
} from "./sdd-tdd";

describe("determinus skills as code (ST-05)", () => {
  test("both skills are well-formed for skill guidance", () => {
    const defs = getDeterminusSkillDefs();
    expect(defs.map((d) => d.id).sort()).toEqual(
      ["determinus-sdd", "determinus-tdd"].sort(),
    );
    for (const def of defs) {
      // SkillInstructions publishes only described, non-excluded skills.
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.content).toContain("determinus_");
      expect(typeof def.slash).toBe("boolean");
      expect(typeof def.autoinvoke).toBe("boolean");
    }
  });

  test("sdd is offered by default, tdd loads on demand", () => {
    expect(DETERMINUS_SDD_SKILL.autoinvoke).toBe(true);
    expect(DETERMINUS_TDD_SKILL.autoinvoke).toBe(false);
  });

  test("registration adds both skills via skill.transform", async () => {
    const added: any[] = [];
    const ctx: any = {
      skill: {
        transform: async (fn: any) => {
          fn({ add: (skill: any) => void added.push(skill) });
        },
      },
    };
    await registerDeterminusSkills(ctx);
    expect(added.map((s) => s.id).sort()).toEqual(
      ["determinus-sdd", "determinus-tdd"].sort(),
    );
  });

  test("registration never throws on hostile hosts", async () => {
    await expect(registerDeterminusSkills(undefined)).resolves.toBeDefined();
    await expect(registerDeterminusSkills({})).resolves.toBeDefined();
    await expect(
      registerDeterminusSkills({
        skill: {
          transform: async () => {
            throw new Error("boom");
          },
        },
      }),
    ).resolves.toBeDefined();
  });
});
