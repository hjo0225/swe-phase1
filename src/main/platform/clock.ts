import { randomUUID } from 'node:crypto';

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export type IdGenerator = () => string;

export const uuid: IdGenerator = () => randomUUID();
