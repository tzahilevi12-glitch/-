import type { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        fullName: string;
        role: Role;
        isActive: boolean;
        hasDrivingChip: boolean;
      };
      sessionTokenHash?: string;
    }
  }
}

export {};
