import { describe, expect, it } from "vitest";
import { classifyCodeTask } from "./classifier";

describe("code task classifier", () => {
  it("classifies implementation prompts in the code profile as task loop candidates", () => {
    expect(classifyCodeTask({
      profileId: "code",
      prompt: "实现 packages/core/src/foo.ts 的验证逻辑并跑单测"
    })).toMatchObject({
      shouldCreateTask: true,
      confidence: "high",
      matchedSignals: expect.arrayContaining(["coding-intent", "edit-target", "code-profile"])
    });
  });

  it("keeps explanation-only prompts on the normal run path", () => {
    expect(classifyCodeTask({
      profileId: "code",
      prompt: "解释这个文件为什么这样设计"
    })).toMatchObject({
      shouldCreateTask: false,
      reason: expect.stringContaining("explanation")
    });
  });

  it("does not silently create tasks for ambiguous prompts", () => {
    expect(classifyCodeTask({
      profileId: "code",
      prompt: "看看这个项目"
    })).toMatchObject({
      shouldCreateTask: false,
      confidence: "low"
    });
  });
});
