import { z } from 'zod';

export const zodConfigFileRuntime = z.record(z.string(), z.unknown());
