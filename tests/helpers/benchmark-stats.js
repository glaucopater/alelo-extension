function extractDurationMs(parsed) {
  if (!parsed || typeof parsed !== "object") return null;

  if (parsed.total_duration != null) {
    return parsed.total_duration / 1e6;
  }

  const timings = parsed.timings;
  if (timings && (timings.prompt_ms != null || timings.predicted_ms != null)) {
    return (timings.prompt_ms ?? 0) + (timings.predicted_ms ?? 0);
  }

  if (parsed.aleloDurationMs != null) {
    return Number(parsed.aleloDurationMs);
  }

  return null;
}

function extractServerDurationMs(parsed) {
  if (!parsed || typeof parsed !== "object") return null;

  if (parsed.total_duration != null) {
    return parsed.total_duration / 1e6;
  }

  const timings = parsed.timings;
  if (timings && (timings.prompt_ms != null || timings.predicted_ms != null)) {
    return (timings.prompt_ms ?? 0) + (timings.predicted_ms ?? 0);
  }

  return null;
}

function extractStatsFromRaw(rawJsonText) {
  try {
    const parsed = JSON.parse(rawJsonText);
    const usage = parsed?.usage;

    let promptTokens = parsed?.prompt_eval_count ?? null;
    let outputTokens = parsed?.eval_count ?? null;
    let totalTokens = null;

    if (usage && (usage.prompt_tokens != null || usage.completion_tokens != null)) {
      promptTokens = usage.prompt_tokens ?? null;
      outputTokens = usage.completion_tokens ?? null;
      const prompt = promptTokens ?? 0;
      const output = outputTokens ?? 0;
      totalTokens =
        usage.total_tokens ??
        (usage.prompt_tokens != null || usage.completion_tokens != null ? prompt + output : null);
    } else if (promptTokens != null || outputTokens != null) {
      const prompt = promptTokens ?? 0;
      const output = outputTokens ?? 0;
      totalTokens = prompt + output;
    }

    const wallMs = extractDurationMs(parsed);
    const serverMs = extractServerDurationMs(parsed);

    return {
      wallMs,
      serverMs,
      promptTokens,
      outputTokens,
      totalTokens
    };
  } catch {
    return null;
  }
}

function summarizeMetric(values) {
  const nums = values.filter((value) => value != null && Number.isFinite(value));
  if (!nums.length) {
    return { min: null, avg: null, max: null, count: 0 };
  }

  const sum = nums.reduce((acc, value) => acc + value, 0);
  return {
    min: Math.min(...nums),
    avg: sum / nums.length,
    max: Math.max(...nums),
    count: nums.length
  };
}

function summarizeRuns(runs) {
  return {
    wallMs: summarizeMetric(runs.map((run) => run.wallMs)),
    serverMs: summarizeMetric(runs.map((run) => run.serverMs)),
    promptTokens: summarizeMetric(runs.map((run) => run.promptTokens)),
    outputTokens: summarizeMetric(runs.map((run) => run.outputTokens)),
    outputChars: summarizeMetric(runs.map((run) => run.outputChars))
  };
}

module.exports = {
  extractStatsFromRaw,
  summarizeMetric,
  summarizeRuns
};
