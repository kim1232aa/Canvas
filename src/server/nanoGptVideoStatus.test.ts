import { describe, expect, it } from 'vitest';
import {
  NANO_GPT_VIDEO_POLL_BUDGET_MS,
  classifyNanoGptVideoStatus,
} from './nanoGptVideoStatus';

describe('NanoGPT unified video status', () => {
  it('keeps polling past the old 175s hard stop (official sample is ~10 min)', () => {
    expect(NANO_GPT_VIDEO_POLL_BUDGET_MS).toBeGreaterThan(175_000);
    expect(NANO_GPT_VIDEO_POLL_BUDGET_MS).toBe(600_000);
  });

  it('reads the nested example URL (data.output.video.url)', () => {
    expect(classifyNanoGptVideoStatus({
      data: { status: 'COMPLETED', output: { video: { url: 'https://storage.example/v.mp4' } } },
    })).toEqual({ kind: 'completed', url: 'https://storage.example/v.mp4', status: 'COMPLETED' });
  });

  it('reads the OpenAPI top-level videoUrl and does not call a finished job pending', () => {
    expect(classifyNanoGptVideoStatus({
      status: 'completed',
      videoUrl: 'https://storage.example/top.mp4',
    })).toEqual({ kind: 'completed', url: 'https://storage.example/top.mp4', status: 'COMPLETED' });
  });

  it('a COMPLETED body with no URL is a protocol error, not a timeout', () => {
    const raw = { status: 'completed', videoUrl: null, data: { status: 'COMPLETED' } };
    expect(classifyNanoGptVideoStatus(raw)).toEqual({
      kind: 'completed-without-url',
      status: 'COMPLETED',
    });
  });

  it('surfaces FAILED with the upstream message', () => {
    expect(classifyNanoGptVideoStatus({
      data: { status: 'FAILED', error: 'Content policy violation' },
    })).toMatchObject({ kind: 'failed', message: 'Content policy violation' });
  });

  it('treats IN_PROGRESS / queued as pending', () => {
    expect(classifyNanoGptVideoStatus({ data: { status: 'IN_PROGRESS' } }).kind).toBe('pending');
    expect(classifyNanoGptVideoStatus({ status: 'queued' }).kind).toBe('pending');
  });
});
