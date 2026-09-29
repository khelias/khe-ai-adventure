// Turns a Gemini generateContent response body into text, or throws. A
// response that was blocked or cut short is never passed on as a result: a
// truncated JSON document or an empty safety stop would otherwise surface as
// a parse error or a broken turn.

const SAFETY_REASONS = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII']);

function responseError(message, status, publicError, reason) {
  const err = new Error(message);
  err.status = status;
  err.publicBody = { error: publicError };
  err.reason = reason;
  return err;
}

function publicErrorFor(reason) {
  if (SAFETY_REASONS.has(reason)) return 'Response blocked by safety filter';
  if (reason === 'MAX_TOKENS') return 'Response too long';
  return 'Upstream error';
}

function parseGeminiResponse(body) {
  const blockReason = body?.promptFeedback?.blockReason;
  if (blockReason) {
    throw responseError(`Gemini blocked the prompt: blockReason=${blockReason}`, 502, publicErrorFor(blockReason), blockReason);
  }
  const candidate = body?.candidates?.[0];
  const finishReason = candidate?.finishReason;
  if (finishReason && finishReason !== 'STOP') {
    throw responseError(`Gemini stopped early: finishReason=${finishReason}`, 502, publicErrorFor(finishReason), finishReason);
  }
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  const text = parts
    .filter((part) => typeof part?.text === 'string' && part.thought !== true)
    .map((part) => part.text)
    .join('');
  if (!text) throw new Error('Gemini returned an empty response');
  return { text, usageMetadata: body?.usageMetadata || {} };
}

module.exports = { parseGeminiResponse, SAFETY_REASONS };
